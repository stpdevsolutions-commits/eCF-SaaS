import { Injectable } from '@nestjs/common';
import { Signature } from 'dgii-ecf';
import { DgiiCertificateService } from '../../dgii/dgii-certificate.service';

/**
 * Firma XMLDSig de e-CF (DGII República Dominicana).
 *
 * La firma (C14N, digest SHA-256, RSA-SHA256, empaquetado del elemento
 * <Signature>) la realiza `Signature` de la librería `dgii-ecf`, que
 * implementa el algoritmo exacto que exige la DGII (incluye un digest sobre
 * namespaces ordenados que xml-crypto no cubre por defecto).
 *
 * El certificado (real o de desarrollo) lo resuelve DgiiCertificateService.
 */
@Injectable()
export class EcfSigningService {
  private signaturePromise?: Promise<Signature>;

  constructor(private certService: DgiiCertificateService) {}

  /** Firma el XML con XMLDSig enveloped (DGII-compliant) usando el certificado activo. */
  async signXml(xmlContent: string): Promise<string> {
    const signature = await this.getSignature();
    return signature.signXml(xmlContent, 'ECF');
  }

  /** Expone el PEM del certificado activo (útil para diagnóstico). */
  getCertificatePem(): Promise<string> {
    return this.certService.getCertificatePem();
  }

  /** true si se está firmando con un certificado P12 real (no el autofirmado de dev). */
  usaCertificadoReal(): Promise<boolean> {
    return this.certService.usaCertificadoReal();
  }

  private getSignature(): Promise<Signature> {
    if (!this.signaturePromise) {
      this.signaturePromise = (async () => {
        const [key, cert] = await Promise.all([
          this.certService.getPrivateKeyPem(),
          this.certService.getCertificatePem(),
        ]);
        return new Signature(key, cert);
      })();
    }
    return this.signaturePromise;
  }
}
