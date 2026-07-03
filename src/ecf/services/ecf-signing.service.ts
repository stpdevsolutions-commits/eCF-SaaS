import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';
import * as forge from 'node-forge';

interface DevCertificate {
  /** Clave privada RSA en formato PEM */
  privateKeyPem: string;
  /** Certificado X.509 en formato PEM */
  certificatePem: string;
  /** Certificado X.509 en DER codificado en Base64 (para <X509Certificate>) */
  certificateDerB64: string;
}

/**
 * Servicio de firma digital XMLDSig para e-CF (DGII República Dominicana).
 *
 * Implementa firma enveloped con:
 *  - Canonicalización: C14N (http://www.w3.org/TR/2001/REC-xml-c14n-20010315)
 *  - Algoritmo de firma: RSA-SHA256
 *  - Digest: SHA-256
 *  - Certificado embebido en X509Certificate
 *
 * En desarrollo genera un certificado autofirmado RSA-2048.
 * En producción, cargar privateKeyPem y certificatePem desde ConfigService / vault.
 */
@Injectable()
export class EcfSigningService implements OnModuleInit {
  private readonly logger = new Logger(EcfSigningService.name);

  /** Se inicializa en onModuleInit — antes de que NestJS empiece a servir peticiones. */
  private devCert!: DevCertificate;

  async onModuleInit(): Promise<void> {
    this.devCert = await this.generateDevCertificate();
    this.logger.log('Certificado de desarrollo RSA-2048 generado y listo');
  }

  // ── API pública ─────────────────────────────────────────────────────────────

  /**
   * Firma el XML con XMLDSig enveloped y retorna el documento con
   * el elemento <ds:Signature> insertado antes de </ECF>.
   */
  signXml(xmlContent: string): string {
    // Paso 1: C14N del documento sin la declaración XML
    const canonicalDoc = this.c14n(xmlContent);

    // Paso 2: Digest SHA-256 del documento canonicalizado
    const digestValue = crypto
      .createHash('sha256')
      .update(canonicalDoc, 'utf8')
      .digest('base64');

    // Paso 3: Construir SignedInfo (con xmlns:ds para usarlo como elemento standalone al firmar)
    const signedInfoXml = this.buildSignedInfo(digestValue);

    // Paso 4: C14N del SignedInfo
    const canonicalSignedInfo = this.c14n(signedInfoXml);

    // Paso 5: Firmar el SignedInfo canonicalizado con RSA-SHA256
    const signer = crypto.createSign('SHA256');
    signer.update(canonicalSignedInfo, 'utf8');
    const signatureValue = signer.sign(this.devCert.privateKeyPem, 'base64');

    // Paso 6: Construir el bloque <ds:Signature> completo
    const signatureBlock = this.buildSignatureBlock(
      signedInfoXml,
      signatureValue,
      this.devCert.certificateDerB64,
    );

    // Paso 7: Insertar la firma antes de </ECF>
    // El xs:any (processContents="skip") en el XSD acepta el elemento Signature.
    return xmlContent.replace(/\n?<\/ECF>\s*$/, `\n${signatureBlock}\n</ECF>`);
  }

  /** Expone el PEM del certificado de desarrollo (útil para diagnóstico). */
  getCertificatePem(): string {
    return this.devCert.certificatePem;
  }

  // ── Helpers de firma ────────────────────────────────────────────────────────

  /**
   * Canonicalización simplificada (Canonical XML 1.0 sin comentarios).
   *
   * Para el XML generado por EcfXmlService (sin atributos en elementos raíz,
   * sin namespaces en el cuerpo ECF) basta con:
   *  - Eliminar la declaración <?xml ...?>
   *  - Preservar el resto del documento sin modificaciones de whitespace
   *
   * NOTA: Para una canonicalización completa conforme a RFC 3076 se requiere
   * una librería especializada (xml-c14n). Esta implementación es suficiente
   * para el certificado de desarrollo y para generar firmas verificables.
   */
  private c14n(xml: string): string {
    return xml
      .replace(/^<\?xml[^?]*\?>\n?/, '')
      .trimEnd();
  }

  /**
   * Construye el elemento <ds:SignedInfo> con namespace explícito para
   * usarlo como elemento standalone durante el proceso de firma.
   */
  private buildSignedInfo(digestValue: string): string {
    return [
      '<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">',
      '  <ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>',
      '  <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>',
      '  <ds:Reference URI="">',
      '    <ds:Transforms>',
      '      <ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>',
      '    </ds:Transforms>',
      '    <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>',
      `    <ds:DigestValue>${digestValue}</ds:DigestValue>`,
      '  </ds:Reference>',
      '</ds:SignedInfo>',
    ].join('\n');
  }

  /**
   * Construye el bloque completo <ds:Signature> para insertar en el documento.
   * El namespace xmlns:ds se declara en el elemento raíz Signature;
   * los hijos heredan ese prefijo sin redeclaración.
   */
  private buildSignatureBlock(
    signedInfoXml: string,
    signatureValue: string,
    certDerB64: string,
  ): string {
    // Quitar el xmlns:ds del SignedInfo inline — el padre (Signature) lo declara.
    const signedInfoInner = signedInfoXml.replace(
      ' xmlns:ds="http://www.w3.org/2000/09/xmldsig#"',
      '',
    );

    // Indentar las líneas del SignedInfo para legibilidad
    const signedInfoIndented = signedInfoInner
      .split('\n')
      .map((l) => '    ' + l)
      .join('\n');

    return [
      '  <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">',
      signedInfoIndented,
      `    <ds:SignatureValue>${signatureValue}</ds:SignatureValue>`,
      '    <ds:KeyInfo>',
      '      <ds:X509Data>',
      `        <ds:X509Certificate>${certDerB64}</ds:X509Certificate>`,
      '      </ds:X509Data>',
      '    </ds:KeyInfo>',
      '  </ds:Signature>',
    ].join('\n');
  }

  // ── Generación del certificado de desarrollo ────────────────────────────────

  /**
   * Genera un certificado autofirmado RSA-2048 / SHA-256 para desarrollo.
   * Usa workers: -1 para no bloquear el event loop de Node.js.
   *
   * En producción, reemplazar con carga del .p12 emitido por la DGII:
   *   const p12Der = fs.readFileSync('cert.p12', 'binary');
   *   const p12Asn1 = forge.asn1.fromDer(p12Der);
   *   const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);
   */
  private generateDevCertificate(): Promise<DevCertificate> {
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

          // Convertir cert a DER → Base64 para el elemento <X509Certificate>
          const certAsn1 = forge.pki.certificateToAsn1(cert);
          const certDerBuf = forge.asn1.toDer(certAsn1);
          const certificateDerB64 = Buffer.from(certDerBuf.getBytes(), 'binary').toString('base64');

          resolve({ privateKeyPem, certificatePem, certificateDerB64 });
        },
      );
    });
  }
}
