import { DOMParser } from '@xmldom/xmldom';
import { SignedXml } from 'xml-crypto';

/**
 * Verifica que la firma XMLDSig embebida en un XML de la DGII (e-CF, ACECF,
 * etc.) sea criptográficamente válida: que el digest coincida con el
 * documento y que la SignatureValue corresponda al certificado incluido en
 * el propio <KeyInfo>/<X509Certificate>.
 *
 * LIMITACIÓN CONOCIDA: esto valida integridad y consistencia firma-documento
 * (que nadie alteró el XML después de firmarlo), pero NO valida la cadena de
 * confianza — es decir, no confirma que el certificado provenga de un PSC
 * acreditado por INDOTEL ni que no esté revocado. Eso requeriría el
 * certificado raíz/cadena que publica la DGII (ver "Descargar certificado
 * raíz" en el Portal de Certificación) y queda fuera de alcance por ahora.
 */
export function verificarFirmaXml(xmlContent: string): boolean {
  try {
    const match = xmlContent.match(
      /<(?:[\w]+:)?X509Certificate>([^<]+)<\/(?:[\w]+:)?X509Certificate>/,
    );
    const certBase64 = match?.[1]?.trim();
    if (!certBase64) {
      return false;
    }

    const cuerpoPem = certBase64.match(/.{1,64}/g)?.join('\n') ?? certBase64;
    const pem = `-----BEGIN CERTIFICATE-----\n${cuerpoPem}\n-----END CERTIFICATE-----\n`;

    const signedXml = new SignedXml({ publicCert: pem });

    // checkSignature() no localiza el nodo <Signature> por sí solo — hay
    // que encontrarlo y cargarlo primero (findSignatures + loadSignature),
    // o falla con "No signature found." aunque la firma sea válida.
    const doc = new DOMParser().parseFromString(xmlContent);
    const [signatureNode] = signedXml.findSignatures(doc);
    if (!signatureNode) {
      return false;
    }
    signedXml.loadSignature(signatureNode);

    return signedXml.checkSignature(xmlContent);
  } catch {
    return false;
  }
}
