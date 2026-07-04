import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ECF, { ENVIRONMENT, setAuthToken, convertECF32ToRFCE, Signature } from 'dgii-ecf';
import { Ecf } from '../ecf/entities/ecf.entity';
import { DgiiCertificateService } from './dgii-certificate.service';
import { EcfAnulacionService } from '../ecf/services/ecf-anulacion.service';
import { EcfSigningService } from '../ecf/services/ecf-signing.service';

export interface DgiiAuthResponse {
  token: string;
  expiresIn: number;
}

interface DgiiTransmitResponse {
  uuid: string;
  codigo: string;
  mensajes: string[];
}

/** Datos del e-CF necesarios para construir el ANECF (anulación de rangos). */
export interface AnulacionRango {
  rncEmisor: string;
  tipoEcf: number;
  encf: string;
}

/** Umbral normativo DGII: por debajo de este monto, el e-CF 32 (Factura de
 * Consumo Electrónica) se transmite como Resumen (RFCE) en vez de e-CF completo. */
const RFCE_MONTO_MAXIMO = 250_000;

/**
 * Integración con la DGII (semilla → firma → token, transmisión, consulta de
 * estado, anulación de rangos). Cuando hay certificado P12 real configurado
 * (ver DgiiCertificateService), usa la librería `dgii-ecf` contra el ambiente
 * indicado por DGII_ENVIRONMENT (TesteCF/CerteCF/eCF). Sin certificado real
 * (dev por defecto), responde con datos simulados — mismo contrato, para no
 * requerir credenciales en desarrollo.
 */
@Injectable()
export class DgiiService {
  private readonly logger = new Logger(DgiiService.name);
  private clientPromise?: Promise<ECF>;

  constructor(
    private configService: ConfigService,
    private certificateService: DgiiCertificateService,
    private anulacionService: EcfAnulacionService,
    private signingService: EcfSigningService,
  ) {}

  async authenticate(
    _rncEmisor: string,
    _usuario: string,
    _clave: string,
  ): Promise<DgiiAuthResponse> {
    // El e-CF de la DGII se autentica con el certificado (semilla firmada),
    // no con usuario/clave — se conservan los parámetros por compatibilidad
    // con el controlador/frontend existentes.
    if (!(await this.modoReal())) {
      return {
        token: `mock-token-${Date.now()}`,
        expiresIn: 3600,
      };
    }

    try {
      const client = await this.getClient();
      const tokenData = await client.authenticate();
      if (!tokenData) {
        throw new HttpException(
          'La DGII no devolvió un token de autenticación',
          HttpStatus.UNAUTHORIZED,
        );
      }
      const expiresIn = Math.max(
        0,
        Math.round((new Date(tokenData.expira).getTime() - Date.now()) / 1000),
      );
      return { token: tokenData.token, expiresIn };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Error autenticando con DGII: ${error}`);
      throw new HttpException(
        'Error autenticando con DGII',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  async transmitEcf(ecf: Ecf, token: string): Promise<DgiiTransmitResponse> {
    if (!(await this.modoReal())) {
      return {
        uuid: `${Date.now()}-mock`,
        codigo: '200',
        mensajes: ['Comprobante aceptado por DGII (mock)'],
      };
    }

    if (!ecf.xmlFirmado || !ecf.encf) {
      throw new HttpException(
        'El comprobante no tiene XML firmado o eNCF asignado',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      setAuthToken(token);
      const client = await this.getClient();
      const fileName = `${ecf.rncEmisor}${ecf.encf}.xml`;

      // Facturas de Consumo Electrónicas (e-CF 32) por menos de RD$250,000 se
      // transmiten como Resumen (RFCE) en vez del e-CF completo — es lo que
      // exige la normativa DGII para este tipo/monto (endpoint distinto).
      if (ecf.tipoEcf === 'e-CF_32_v_1_0' && Number(ecf.montoTotal) < RFCE_MONTO_MAXIMO) {
        const { xml: rfceXml } = convertECF32ToRFCE(ecf.xmlFirmado);

        // El RFCE resultante de convertECF32ToRFCE NO viene firmado — hay que
        // firmarlo aparte (rootElName 'RFCE') con el mismo certificado antes
        // de enviarlo, o la DGII lo rechaza por estructura XML incompleta.
        const { key, cert } = await this.certificateService.getP12ReaderData();
        const signedRfceXml = new Signature(key ?? '', cert ?? '').signXml(rfceXml, 'RFCE');

        const respuestaResumen = await client.sendSummary(signedRfceXml, fileName);

        if (!respuestaResumen) {
          throw new HttpException(
            'La DGII no devolvió respuesta para el resumen (RFCE)',
            HttpStatus.BAD_REQUEST,
          );
        }

        return {
          // El flujo RFCE no genera un trackId como sendElectronicDocument —
          // se usa el eNCF como identificador. Limitación conocida: no hay
          // forma de rastrear este envío por trackId de la misma manera.
          uuid: ecf.encf,
          codigo: String(respuestaResumen.codigo),
          mensajes: respuestaResumen.mensajes?.map((m) => m.valor) ?? [],
        };
      }

      const respuesta = await client.sendElectronicDocument(ecf.xmlFirmado, fileName);

      if (!respuesta?.trackId) {
        throw new HttpException(
          respuesta?.error ?? 'La DGII no devolvió un trackId de transmisión',
          HttpStatus.BAD_REQUEST,
        );
      }

      return {
        uuid: respuesta.trackId,
        codigo: '0',
        mensajes: (respuesta.mensajes ?? []).map((m) => m.valor),
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Error transmitiendo a DGII: ${error}`);
      throw new HttpException(
        'Error en transmisión a DGII',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async queryEcfStatus(uuid: string, token: string): Promise<any> {
    if (!(await this.modoReal())) {
      return {
        uuid,
        estado: 'Aceptado',
        codigo: '200',
        mensaje: 'Comprobante aceptado (mock)',
      };
    }

    try {
      setAuthToken(token);
      const client = await this.getClient();
      const resultado = await client.statusTrackId(uuid);
      if (!resultado) {
        throw new HttpException(
          'La DGII no devolvió estado para este trackId',
          HttpStatus.NOT_FOUND,
        );
      }

      return {
        uuid,
        estado: resultado.estado,
        codigo: String(resultado.codigo),
        mensaje: (resultado.mensajes ?? []).map((m) => m.valor).join('; ') || resultado.estado,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Error consultando estado en DGII: ${error}`);
      throw new HttpException(
        'Error consultando DGII',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Cancela (anula) un eNCF ante la DGII.
   *
   * En modo mock devuelve un resultado simulado fijo (sin cambios).
   * En modo real construye y firma el XML ANECF (anulación de rangos, en
   * este caso un rango de un solo eNCF) y lo envía con `client.voidENCF`.
   * Requiere `rango` (RNC emisor, tipo de e-CF y eNCF puntual) — sin él no
   * es posible construir el documento ANECF.
   */
  async cancelEcf(
    uuid: string,
    motivo: string,
    token: string,
    rango?: AnulacionRango,
  ): Promise<any> {
    if (!(await this.modoReal())) {
      return {
        uuid,
        estado: 'Cancelado',
        motivo,
        codigo: '200',
        mensaje: 'Comprobante cancelado (mock)',
      };
    }

    if (!rango) {
      throw new HttpException(
        'Anulación real de e-CF requiere RNC emisor, tipo de e-CF y el eNCF a anular',
        HttpStatus.BAD_REQUEST,
      );
    }

    // dgii-ecf se autentica con el certificado/semilla propios (getClient),
    // no con el token de sesión REST — se conserva el parámetro por
    // compatibilidad con el controlador existente.
    void token;

    try {
      const xmlSinFirmar = this.anulacionService.generateXmlParaUnEncf(
        rango.rncEmisor,
        rango.tipoEcf,
        rango.encf,
      );
      const signedXml = await this.signingService.signXml(xmlSinFirmar, 'ANECF');
      const client = await this.getClient();
      const fileName = `${rango.rncEmisor}${rango.encf}.xml`;
      const respuesta = await client.voidENCF(signedXml, fileName);

      if (!respuesta) {
        throw new HttpException(
          'La DGII no devolvió respuesta para la anulación',
          HttpStatus.BAD_REQUEST,
        );
      }

      return {
        uuid,
        estado: 'Cancelado',
        motivo,
        codigo: respuesta.codigo,
        mensaje: (respuesta.mensajes ?? []).join('; ') || respuesta.nombre,
        rnc: respuesta.rnc,
        nombre: respuesta.nombre,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Error anulando eNCF en DGII: ${error}`);
      throw new HttpException(
        'Error en anulación DGII',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ── Cliente DGII (dgii-ecf) ──────────────────────────────────────────────────

  private async modoReal(): Promise<boolean> {
    return this.certificateService.usaCertificadoReal();
  }

  private getClient(): Promise<ECF> {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const p12ReaderData = await this.certificateService.getP12ReaderData();
        const environment =
          (this.configService.get<string>('DGII_ENVIRONMENT') as ENVIRONMENT) ||
          ENVIRONMENT.DEV;
        return new ECF(p12ReaderData, environment);
      })();
    }
    return this.clientPromise;
  }
}
