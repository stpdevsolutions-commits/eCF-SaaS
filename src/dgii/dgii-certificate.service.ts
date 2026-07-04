import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as forge from 'node-forge';
import { P12Reader } from 'dgii-ecf';

interface CertificadoActivo {
  privateKeyPem: string;
  certificatePem: string;
  origen: 'desarrollo' | 'p12-real';
}

/**
 * Resuelve el certificado usado para firmar e-CF y autenticar contra la DGII.
 *
 * Único punto de configuración del certificado real: cuando lleguen las
 * credenciales TesteCF (P12 de un PSC acreditado por INDOTEL), basta con
 * setear DGII_CERT_P12_BASE64 + DGII_CERT_PASSPHRASE — no se requieren
 * cambios de código en EcfSigningService ni en DgiiService.
 *
 * Mientras tanto, genera un certificado autofirmado RSA-2048 (solo dev).
 * La carga es perezosa y memoizada (una sola vez por proceso).
 */
@Injectable()
export class DgiiCertificateService {
  private readonly logger = new Logger(DgiiCertificateService.name);
  private certificadoPromise?: Promise<CertificadoActivo>;

  constructor(private configService: ConfigService) {}

  async getPrivateKeyPem(): Promise<string> {
    return (await this.cargar()).privateKeyPem;
  }

  async getCertificatePem(): Promise<string> {
    return (await this.cargar()).certificatePem;
  }

  /** Shape compatible con P12ReaderData de dgii-ecf (key/cert en PEM). */
  async getP12ReaderData(): Promise<{ key: string; cert: string }> {
    const { privateKeyPem, certificatePem } = await this.cargar();
    return { key: privateKeyPem, cert: certificatePem };
  }

  /** true si se está usando el certificado P12 real (no el autofirmado de dev). */
  async usaCertificadoReal(): Promise<boolean> {
    return (await this.cargar()).origen === 'p12-real';
  }

  private cargar(): Promise<CertificadoActivo> {
    if (!this.certificadoPromise) {
      this.certificadoPromise = this.resolverCertificado();
    }
    return this.certificadoPromise;
  }

  private async resolverCertificado(): Promise<CertificadoActivo> {
    const real = this.cargarCertificadoReal();
    if (real) {
      this.logger.log('Certificado P12 real cargado desde DGII_CERT_P12_BASE64');
      return real;
    }
    const dev = await this.generarCertificadoDesarrollo();
    this.logger.log('Certificado de desarrollo RSA-2048 generado y listo (autofirmado, solo dev)');
    return dev;
  }

  private cargarCertificadoReal(): CertificadoActivo | undefined {
    const p12Base64 = this.configService.get<string>('DGII_CERT_P12_BASE64');
    const passphrase = this.configService.get<string>('DGII_CERT_PASSPHRASE');
    if (!p12Base64 || !passphrase) {
      return undefined;
    }

    const reader = new P12Reader(passphrase);
    const { key, cert } = reader.getKeyFromStringBase64(p12Base64);
    if (!key || !cert) {
      throw new Error(
        'DGII_CERT_P12_BASE64 configurado pero no se pudo extraer clave privada/certificado (revisa DGII_CERT_PASSPHRASE)',
      );
    }

    return { privateKeyPem: key, certificatePem: cert, origen: 'p12-real' };
  }

  /**
   * Genera un certificado autofirmado RSA-2048 / SHA-256 para desarrollo.
   * Usa workers: -1 para no bloquear el event loop de Node.js.
   */
  private generarCertificadoDesarrollo(): Promise<CertificadoActivo> {
    return new Promise((resolve, reject) => {
      this.logger.log('Generando par de claves RSA-2048 (puede tardar unos segundos en dev)…');

      forge.pki.rsa.generateKeyPair(
        { bits: 2048, workers: -1 },
        (err: Error | null, keyPair: forge.pki.rsa.KeyPair) => {
          if (err) {
            reject(err);
            return;
          }

          const cert = forge.pki.createCertificate();
          cert.publicKey = keyPair.publicKey;
          cert.serialNumber = '01';

          const now = new Date();
          cert.validity.notBefore = now;
          cert.validity.notAfter = new Date(now);
          cert.validity.notAfter.setFullYear(now.getFullYear() + 2);

          const attrs: forge.pki.CertificateField[] = [
            { name: 'commonName', value: 'eCF-SaaS-Desarrollo' },
            { name: 'countryName', value: 'DO' },
            { name: 'stateOrProvinceName', value: 'Distrito Nacional' },
            { name: 'organizationName', value: 'eCF SaaS Desarrollo' },
          ];
          cert.setSubject(attrs);
          cert.setIssuer(attrs);
          cert.setExtensions([
            { name: 'basicConstraints', cA: false },
            {
              name: 'keyUsage',
              digitalSignature: true,
              nonRepudiation: true,
              keyEncipherment: false,
            },
          ]);

          cert.sign(keyPair.privateKey, forge.md.sha256.create());

          const privateKeyPem = forge.pki.privateKeyToPem(keyPair.privateKey);
          const certificatePem = forge.pki.certificateToPem(cert);

          resolve({ privateKeyPem, certificatePem, origen: 'desarrollo' });
        },
      );
    });
  }
}
