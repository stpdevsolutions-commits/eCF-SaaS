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

export interface AnalisisFirmaXml {
  /** La firma es criptográficamente válida con el certificado embebido. */
  valida: boolean;
  motivo?: string;
  /** Certificado firmante (el primero de <X509Data>) en PEM. */
  certificadoPem?: string;
  /** Certificados adicionales de <X509Data> (cadena intermedia), en PEM. */
  certificadosIntermediosPem: string[];
  /** Contenido XML canónico que la firma REALMENTE cubre (referencias verificadas). */
  referenciasFirmadas: string[];
}

const aPem = (b64: string): string =>
  `-----BEGIN CERTIFICATE-----\n${b64.replace(/\s+/g, '').match(/.{1,64}/g)?.join('\n') ?? b64}\n-----END CERTIFICATE-----\n`;

/**
 * Como verificarFirmaXml, pero además devuelve el certificado firmante, la
 * cadena embebida y el contenido que la firma efectivamente cubre. Hace falta
 * cuando se debe garantizar que un dato concreto (p. ej. el <valor> de la
 * semilla) está DENTRO de lo firmado: una firma válida sobre otra parte del
 * documento no basta.
 */
export function analizarFirmaXml(xmlContent: string): AnalisisFirmaXml {
  const vacio: AnalisisFirmaXml = { valida: false, certificadosIntermediosPem: [], referenciasFirmadas: [] };
  try {
    const certs = [
      ...xmlContent.matchAll(/<(?:[\w]+:)?X509Certificate>([^<]+)<\/(?:[\w]+:)?X509Certificate>/g),
    ].map((m) => m[1].trim());
    if (certs.length === 0) return { ...vacio, motivo: 'La firma no incluye el certificado (X509Certificate)' };

    const certificadoPem = aPem(certs[0]);
    const signedXml = new SignedXml({ publicCert: certificadoPem });
    const doc = new DOMParser().parseFromString(xmlContent);
    const [signatureNode] = signedXml.findSignatures(doc);
    if (!signatureNode) return { ...vacio, motivo: 'El XML no contiene una firma XMLDSig' };
    signedXml.loadSignature(signatureNode);

    if (!signedXml.checkSignature(xmlContent)) {
      return { ...vacio, certificadoPem, motivo: 'La firma digital no es válida' };
    }
    return {
      valida: true,
      certificadoPem,
      certificadosIntermediosPem: certs.slice(1).map(aPem),
      referenciasFirmadas: signedXml.getSignedReferences(),
    };
  } catch (e) {
    return { ...vacio, motivo: `No se pudo verificar la firma: ${(e as Error).message}` };
  }
}
