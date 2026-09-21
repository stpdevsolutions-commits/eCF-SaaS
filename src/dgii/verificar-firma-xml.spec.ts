import * as forge from 'node-forge';
import { Signature } from 'dgii-ecf';
import { verificarFirmaXml } from './verificar-firma-xml';

/** Genera un certificado autofirmado rápido (1024 bits, solo para test) igual que DgiiCertificateService pero sync. */
function generarCertificadoDePrueba(): { privateKeyPem: string; certificatePem: string } {
  const keyPair = forge.pki.rsa.generateKeyPair({ bits: 1024 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keyPair.publicKey;
  cert.serialNumber = '01';
  const now = new Date();
  cert.validity.notBefore = now;
  cert.validity.notAfter = new Date(now);
  cert.validity.notAfter.setFullYear(now.getFullYear() + 1);
  const attrs = [{ name: 'commonName', value: 'Test' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keyPair.privateKey, forge.md.sha256.create());

  return {
    privateKeyPem: forge.pki.privateKeyToPem(keyPair.privateKey),
    certificatePem: forge.pki.certificateToPem(cert),
  };
}

describe('verificarFirmaXml', () => {
  let privateKeyPem: string;
  let certificatePem: string;

  beforeAll(() => {
    ({ privateKeyPem, certificatePem } = generarCertificadoDePrueba());
  });

  it('devuelve true para un XML firmado correctamente con el certificado embebido', () => {
    const signature = new Signature(privateKeyPem, certificatePem);
    const xmlFirmado = signature.signXml('<ECF><Monto>100</Monto></ECF>', 'ECF');

    expect(verificarFirmaXml(xmlFirmado)).toBe(true);
  });

  it('devuelve false si el contenido se alteró después de firmar', () => {
    const signature = new Signature(privateKeyPem, certificatePem);
    const xmlFirmado = signature.signXml('<ECF><Monto>100</Monto></ECF>', 'ECF');
    const xmlAlterado = xmlFirmado.replace('<Monto>100</Monto>', '<Monto>999</Monto>');

    expect(verificarFirmaXml(xmlAlterado)).toBe(false);
  });

  it('devuelve false si el XML no tiene ninguna firma', () => {
    expect(verificarFirmaXml('<ECF><Monto>100</Monto></ECF>')).toBe(false);
  });

  it('devuelve false ante un XML inválido en vez de lanzar una excepción', () => {
    expect(verificarFirmaXml('esto no es XML')).toBe(false);
  });
});
