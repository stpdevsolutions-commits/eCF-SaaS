import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { Injectable, Logger, UnauthorizedException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DOMParser } from '@xmldom/xmldom';
import * as forge from 'node-forge';
import { getJwtSecret } from '../auth/jwt-secret.util';
import { analizarFirmaXml } from './verificar-firma-xml';

/** Contenido del token emitido (viaja firmado con HMAC, no cifrado). */
export interface PayloadTokenDgii {
  jti: string;
  /** Emitido / vence (segundos epoch). */
  iat: number;
  exp: number;
  /** Huella SHA-256 (hex) del certificado con el que se autenticó el cliente. */
  sub: string;
  /** commonName del certificado, solo informativo. */
  cn?: string;
}

export interface RespuestaAutenticacion {
  token: string;
  /** yyyy-MM-ddTHH:mm:ssZ */
  expira: string;
  expedido: string;
}

const TTL_SEMILLA_MS = 5 * 60_000;
const MAX_SEMILLAS_PENDIENTES = 5_000;
/** La DGII entrega tokens de 1 hora "por el momento"; ese es también nuestro máximo. */
const TTL_TOKEN_MAX_S = 3_600;
const TTL_TOKEN_MIN_S = 60;

/**
 * URL de Autenticación OPCIONAL del Directorio FE (Descripción Técnica de
 * Facturación Electrónica, sección Autenticación / Emisor-Receptor): la DGII u
 * otro emisor se autentica contra NOSOTROS antes de enviarnos comprobantes.
 * Es el sentido inverso de DgiiService.authenticate (nosotros → DGII), que no
 * se toca.
 *
 * Flujo:
 *  1. GET  semilla             → <SemillaModel><valor/><fecha/></SemillaModel>.
 *  2. POST validacioncertificado (multipart `xml` = semilla FIRMADA con el
 *     certificado del cliente) → { token, expira, expedido }.
 *  3. El cliente manda `Authorization: Bearer {token}` a nuestras URLs
 *     (ver DgiiTokenGuard).
 *
 * Validaciones de la semilla firmada: XML bien formado y raíz SemillaModel;
 * valor emitido por nosotros, no vencido (5 min) y de un solo uso; firma XMLDSig
 * válida Y que cubre el <valor> (no una firma sobre otra parte del documento);
 * certificado dentro de su vigencia; y confianza del certificado (ver
 * `evaluarConfianza`).
 *
 * Config (todas opcionales):
 *  - DGII_AUTH_CERT_FINGERPRINTS: huellas SHA-256 (hex, con o sin ':') de certificados permitidos, separadas por coma.
 *  - DGII_AUTH_CA_CERTS_BASE64: PEM(s) de CA/raíz de confianza (p. ej. la cadena de la DGII/INDOTEL), en base64.
 *  - DGII_AUTH_ALLOW_ANY_CERT=true: acepta cualquier certificado vigente con firma válida (SOLO pruebas; ignorado con DGII_ENVIRONMENT=eCF).
 *  - DGII_AUTH_TOKEN_SECRET: secreto HMAC del token (si falta, se usa JWT_SECRET).
 *  - DGII_AUTH_TOKEN_TTL_SECONDS: vigencia del token (60..3600, por defecto 3600).
 *  - DGII_WEBHOOK_AUTH_REQUIRED=true: exige el token en las URL de Recepción/Aprobación Comercial.
 *
 * Sin huellas ni CA ni ALLOW_ANY, la validación RECHAZA (falla cerrado): emitir
 * tokens a cualquiera no autentica nada.
 *
 * Limitación: las semillas pendientes viven en memoria del proceso (una sola
 * instancia de ecf-api); con varias réplicas habría que moverlas a Redis.
 */
@Injectable()
export class DgiiAutenticacionService {
  private readonly logger = new Logger(DgiiAutenticacionService.name);
  private readonly semillas = new Map<string, number>(); // valor → expira (ms epoch)
  private claveToken?: Buffer;

  constructor(private configService: ConfigService) {}

  // ── 1. Semilla ──────────────────────────────────────────────────────────────

  generarSemilla(ahora = new Date()): { valor: string; xml: string } {
    this.purgarSemillas(ahora.getTime());
    if (this.semillas.size >= MAX_SEMILLAS_PENDIENTES) {
      throw new ServiceUnavailableException('Demasiadas semillas pendientes; reintente en unos minutos');
    }
    const valor = randomUUID();
    this.semillas.set(valor, ahora.getTime() + TTL_SEMILLA_MS);
    const xml =
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<SemillaModel xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">' +
      `<valor>${valor}</valor><fecha>${this.fechaSemilla(ahora)}</fecha></SemillaModel>`;
    return { valor, xml };
  }

  // ── 2. Validación del certificado ───────────────────────────────────────────

  validarSemillaFirmada(xmlFirmado: string, ahora = new Date()): RespuestaAutenticacion {
    const valor = this.extraerValor(xmlFirmado);

    const vence = this.semillas.get(valor);
    if (vence === undefined) throw new UnauthorizedException('Semilla desconocida o ya utilizada');
    if (vence < ahora.getTime()) {
      this.semillas.delete(valor);
      throw new UnauthorizedException('La semilla venció; solicite una nueva');
    }

    const analisis = analizarFirmaXml(xmlFirmado);
    if (!analisis.valida || !analisis.certificadoPem) {
      throw new UnauthorizedException(analisis.motivo ?? 'Firma digital inválida');
    }
    // La firma debe cubrir el <valor> emitido por nosotros.
    if (!analisis.referenciasFirmadas.some((r) => r.includes(`<valor>${valor}</valor>`))) {
      throw new UnauthorizedException('La firma no cubre la semilla');
    }

    const cert = forge.pki.certificateFromPem(analisis.certificadoPem);
    if (ahora < cert.validity.notBefore || ahora > cert.validity.notAfter) {
      throw new UnauthorizedException('El certificado está fuera de su período de vigencia');
    }
    const huella = this.huella(cert);
    this.evaluarConfianza(cert, huella, analisis.certificadosIntermediosPem);

    // Un solo uso: se consume solo cuando TODO lo anterior pasó.
    this.semillas.delete(valor);
    const cn = cert.subject.getField('CN')?.value as string | undefined;
    return this.emitirToken(huella, cn, ahora);
  }

  // ── 3. Token ────────────────────────────────────────────────────────────────

  private emitirToken(huella: string, cn: string | undefined, ahora: Date): RespuestaAutenticacion {
    const ttl = this.ttlToken();
    const iat = Math.floor(ahora.getTime() / 1000);
    const payload: PayloadTokenDgii = { jti: randomBytes(12).toString('hex'), iat, exp: iat + ttl, sub: huella, ...(cn ? { cn } : {}) };
    const cuerpo = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const token = `${cuerpo}.${this.mac(cuerpo)}`;
    return { token, expedido: this.isoSegundos(iat), expira: this.isoSegundos(iat + ttl) };
  }

  /** Valida un Bearer token emitido por esta clase. Lanza 401 si es inválido o venció. */
  validarToken(token: string | undefined, ahora = new Date()): PayloadTokenDgii {
    if (!token) throw new UnauthorizedException('Falta el token de autenticación (Authorization: Bearer)');
    const partes = token.split('.');
    if (partes.length !== 2) throw new UnauthorizedException('Token inválido');
    const [cuerpo, mac] = partes;
    const esperado = Buffer.from(this.mac(cuerpo));
    const recibido = Buffer.from(mac);
    if (esperado.length !== recibido.length || !timingSafeEqual(esperado, recibido)) {
      throw new UnauthorizedException('Token inválido');
    }
    let payload: PayloadTokenDgii;
    try {
      payload = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf-8'));
    } catch {
      throw new UnauthorizedException('Token inválido');
    }
    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= ahora.getTime()) {
      throw new UnauthorizedException('Token vencido');
    }
    return payload;
  }

  /** true si las URL de Recepción/Aprobación Comercial deben exigir el token. */
  autenticacionRequerida(): boolean {
    return this.configService.get<string>('DGII_WEBHOOK_AUTH_REQUIRED') === 'true';
  }

  // ── Confianza en el certificado ─────────────────────────────────────────────

  private evaluarConfianza(cert: forge.pki.Certificate, huella: string, intermediosPem: string[]): void {
    const huellas = (this.configService.get<string>('DGII_AUTH_CERT_FINGERPRINTS') ?? '')
      .split(',')
      .map((h) => h.replace(/[:\s]/g, '').toLowerCase())
      .filter(Boolean);
    if (huellas.includes(huella)) return;

    const caBase64 = this.configService.get<string>('DGII_AUTH_CA_CERTS_BASE64');
    if (caBase64) {
      try {
        const pems = Buffer.from(caBase64, 'base64').toString('utf-8').match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
        const store = forge.pki.createCaStore(pems);
        const cadena = [cert, ...intermediosPem.map((p) => forge.pki.certificateFromPem(p))];
        forge.pki.verifyCertificateChain(store, cadena);
        return;
      } catch (e) {
        const msg = (e as { message?: string }).message ?? 'cadena no verificable';
        this.logger.warn(`Certificado ${huella.slice(0, 12)}… rechazado por la cadena de confianza: ${msg}`);
        throw new UnauthorizedException('El certificado no es de confianza');
      }
    }

    if (huellas.length > 0) throw new UnauthorizedException('El certificado no está autorizado');

    const cualquiera = this.configService.get<string>('DGII_AUTH_ALLOW_ANY_CERT') === 'true';
    const produccion = (this.configService.get<string>('DGII_ENVIRONMENT') ?? '') === 'eCF';
    if (cualquiera && !produccion) {
      this.logger.warn('DGII_AUTH_ALLOW_ANY_CERT=true: aceptando un certificado sin verificar su confianza (solo pruebas)');
      return;
    }
    this.logger.warn('Autenticación entrante rechazada: no hay DGII_AUTH_CERT_FINGERPRINTS ni DGII_AUTH_CA_CERTS_BASE64 configurados');
    throw new UnauthorizedException('Servicio de autenticación sin certificados de confianza configurados');
  }

  // ── Utilidades ──────────────────────────────────────────────────────────────

  private extraerValor(xml: string): string {
    const errores: string[] = [];
    const doc = new DOMParser({
      errorHandler: { warning: () => undefined, error: (m: string) => errores.push(m), fatalError: (m: string) => errores.push(m) },
    }).parseFromString(xml, 'text/xml');
    const raiz = doc?.documentElement;
    if (errores.length > 0 || !raiz) throw new BadRequestException('El XML de la semilla no está bien formado');
    if (raiz.localName !== 'SemillaModel') throw new BadRequestException('La raíz del XML debe ser <SemillaModel>');
    const nodo = Array.from(raiz.childNodes as ArrayLike<Node>).find((n) => n.nodeType === 1 && (n as Element).localName === 'valor');
    const valor = nodo?.textContent?.trim();
    if (!valor) throw new BadRequestException('La semilla no contiene <valor>');
    return valor;
  }

  private huella(cert: forge.pki.Certificate): string {
    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    return createHash('sha256').update(Buffer.from(der, 'binary')).digest('hex');
  }

  private purgarSemillas(ahoraMs: number): void {
    for (const [valor, vence] of this.semillas) if (vence < ahoraMs) this.semillas.delete(valor);
  }

  private ttlToken(): number {
    const cfg = Number(this.configService.get<string>('DGII_AUTH_TOKEN_TTL_SECONDS'));
    if (!Number.isFinite(cfg) || cfg <= 0) return TTL_TOKEN_MAX_S;
    return Math.min(TTL_TOKEN_MAX_S, Math.max(TTL_TOKEN_MIN_S, Math.floor(cfg)));
  }

  private mac(cuerpo: string): string {
    if (!this.claveToken) {
      const secreto = this.configService.get<string>('DGII_AUTH_TOKEN_SECRET') || getJwtSecret(this.configService);
      // Clave derivada: aunque se reutilice JWT_SECRET, este token nunca sirve como JWT de usuario ni al revés.
      this.claveToken = createHmac('sha256', secreto).update('ecf-saas/dgii-fe-auth-token/v1').digest();
    }
    return createHmac('sha256', this.claveToken).update(cuerpo).digest('base64url');
  }

  private isoSegundos(epochSeg: number): string {
    return new Date(epochSeg * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  /** Formato de la DGII: 2019-03-13T14:33:32.8617792-04:00 (hora de Santo Domingo, 7 decimales). */
  private fechaSemilla(d: Date): string {
    const local = new Date(d.getTime() - 4 * 3_600_000).toISOString(); // UTC-4 fijo (RD no usa horario de verano)
    return local.replace(/\.(\d{3})Z$/, (_m, ms: string) => `.${ms}0000-04:00`);
  }
}
