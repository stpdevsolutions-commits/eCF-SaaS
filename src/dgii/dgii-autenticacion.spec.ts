import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Signature } from 'dgii-ecf';
import { text } from 'express';
import * as forge from 'node-forge';
import request from 'supertest';
import { DgiiAutenticacionController } from './dgii-autenticacion.controller';
import { DgiiAutenticacionService } from './dgii-autenticacion.service';
import { DgiiReceptorService } from './dgii-receptor.service';
import { DgiiTokenGuard } from './dgii-token.guard';
import { DgiiWebhookController } from './dgii-webhook.controller';

/** Certificados de PRUEBA autogenerados (1024 bits por velocidad). Jamás se usa el certificado real. */
interface Identidad {
  keyPem: string;
  certPem: string;
  huella: string;
  cert: forge.pki.Certificate;
  key: forge.pki.rsa.PrivateKey;
}

function crearIdentidad(opts: { cn: string; emisor?: Identidad; ca?: boolean; vencido?: boolean } ): Identidad {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 1024 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = String(Math.floor(Math.random() * 1e9) + 1);
  const ahora = Date.now();
  cert.validity.notBefore = new Date(ahora - (opts.vencido ? 400 : 1) * 86_400_000);
  cert.validity.notAfter = new Date(ahora + (opts.vencido ? -200 : 365) * 86_400_000);
  const attrs = [{ name: 'commonName', value: opts.cn }];
  cert.setSubject(attrs);
  cert.setIssuer(opts.emisor ? opts.emisor.cert.subject.attributes : attrs);
  cert.setExtensions([{ name: 'basicConstraints', cA: !!opts.ca }]);
  cert.sign(opts.emisor ? opts.emisor.key : keys.privateKey, forge.md.sha256.create());
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const huella = forge.md.sha256.create().update(der).digest().toHex();
  return { keyPem: forge.pki.privateKeyToPem(keys.privateKey), certPem: forge.pki.certificateToPem(cert), huella, cert, key: keys.privateKey };
}

const firmar = (semillaXml: string, id: Identidad) => new Signature(id.keyPem, id.certPem).signXml(semillaXml, 'SemillaModel');
const valorDe = (xml: string) => xml.match(/<valor>([^<]+)<\/valor>/)![1];

describe('Servicio URL de Autenticación entrante (ECF-8)', () => {
  let cliente: Identidad;
  let config: Record<string, string | undefined>;
  let servicio: DgiiAutenticacionService;

  beforeAll(() => {
    cliente = crearIdentidad({ cn: 'Cliente DGII de prueba' });
  });
  beforeEach(() => {
    config = { DGII_AUTH_CERT_FINGERPRINTS: cliente.huella, DGII_AUTH_TOKEN_SECRET: 'secreto-de-prueba-largo-largo-largo' };
    servicio = new DgiiAutenticacionService({ get: (k: string) => config[k] } as unknown as ConfigService);
  });

  describe('semilla', () => {
    it('emite un SemillaModel con valor único y fecha en el formato de la DGII', () => {
      const a = servicio.generarSemilla();
      const b = servicio.generarSemilla();

      expect(a.xml).toMatch(/^<\?xml version="1.0" encoding="utf-8"\?><SemillaModel /);
      expect(a.xml).toMatch(/<fecha>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{7}-04:00<\/fecha>/);
      expect(a.valor).not.toBe(b.valor);
    });
  });

  describe('validarSemillaFirmada', () => {
    it('con semilla bien firmada y certificado permitido emite un token de 1 hora', () => {
      const { xml } = servicio.generarSemilla();

      const r = servicio.validarSemillaFirmada(firmar(xml, cliente));

      expect(r.token).toMatch(/^[\w-]+\.[\w-]+$/);
      expect(new Date(r.expira).getTime() - new Date(r.expedido).getTime()).toBe(3_600_000);
      expect(r.expira).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      const payload = servicio.validarToken(r.token);
      expect(payload.sub).toBe(cliente.huella);
      expect(payload.cn).toBe('Cliente DGII de prueba');
    });

    it('la semilla es de un solo uso (anti-replay)', () => {
      const { xml } = servicio.generarSemilla();
      const firmada = firmar(xml, cliente);

      servicio.validarSemillaFirmada(firmada);

      expect(() => servicio.validarSemillaFirmada(firmada)).toThrow('desconocida o ya utilizada');
    });

    it('rechaza una semilla que nosotros no emitimos', () => {
      const ajena = '<SemillaModel><valor>00000000-0000-0000-0000-000000000000</valor><fecha>2026-01-01T00:00:00.0000000-04:00</fecha></SemillaModel>';
      expect(() => servicio.validarSemillaFirmada(firmar(ajena, cliente))).toThrow('desconocida o ya utilizada');
    });

    it('rechaza una semilla vencida (5 minutos)', () => {
      const { xml } = servicio.generarSemilla(new Date('2026-10-14T12:00:00Z'));
      expect(() => servicio.validarSemillaFirmada(firmar(xml, cliente), new Date('2026-10-14T12:06:00Z'))).toThrow('venció');
    });

    it('rechaza un XML sin firma o alterado después de firmar', () => {
      const { xml, valor } = servicio.generarSemilla();
      expect(() => servicio.validarSemillaFirmada(xml)).toThrow('no incluye el certificado');

      const otra = servicio.generarSemilla();
      // se cambia el valor firmado por otra semilla válida emitida por nosotros: la firma ya no corresponde
      const alterada = firmar(xml, cliente).replace(valor, otra.valor);
      expect(() => servicio.validarSemillaFirmada(alterada)).toThrow('no es válida');
    });

    it('rechaza XML mal formado o con otra raíz', () => {
      expect(() => servicio.validarSemillaFirmada('esto no es xml')).toThrow();
      expect(() => servicio.validarSemillaFirmada('<Otra><valor>x</valor></Otra>')).toThrow('<SemillaModel>');
    });

    it('rechaza un certificado fuera de vigencia', () => {
      const vencido = crearIdentidad({ cn: 'Vencido', vencido: true });
      config['DGII_AUTH_CERT_FINGERPRINTS'] = vencido.huella;
      const { xml } = servicio.generarSemilla();

      expect(() => servicio.validarSemillaFirmada(firmar(xml, vencido))).toThrow('vigencia');
    });

    it('rechaza un certificado que no está en la lista de huellas permitidas', () => {
      const intruso = crearIdentidad({ cn: 'Intruso' });
      const { xml } = servicio.generarSemilla();

      expect(() => servicio.validarSemillaFirmada(firmar(xml, intruso))).toThrow('no está autorizado');
    });

    it('un fallo NO consume la semilla (el cliente legítimo aún puede usarla)', () => {
      const intruso = crearIdentidad({ cn: 'Intruso' });
      const { xml } = servicio.generarSemilla();
      expect(() => servicio.validarSemillaFirmada(firmar(xml, intruso))).toThrow();

      expect(servicio.validarSemillaFirmada(firmar(xml, cliente)).token).toBeTruthy();
    });

    describe('política de confianza', () => {
      it('falla CERRADO si no hay huellas, CA ni ALLOW_ANY configurados', () => {
        delete config['DGII_AUTH_CERT_FINGERPRINTS'];
        const { xml } = servicio.generarSemilla();
        expect(() => servicio.validarSemillaFirmada(firmar(xml, cliente))).toThrow('sin certificados de confianza');
      });

      it('DGII_AUTH_ALLOW_ANY_CERT=true acepta cualquier certificado vigente, salvo en producción (eCF)', () => {
        delete config['DGII_AUTH_CERT_FINGERPRINTS'];
        config['DGII_AUTH_ALLOW_ANY_CERT'] = 'true';
        expect(servicio.validarSemillaFirmada(firmar(servicio.generarSemilla().xml, cliente)).token).toBeTruthy();

        config['DGII_ENVIRONMENT'] = 'eCF';
        expect(() => servicio.validarSemillaFirmada(firmar(servicio.generarSemilla().xml, cliente))).toThrow('sin certificados de confianza');
      });

      it('acepta un certificado emitido por la CA configurada y rechaza el de otra CA', () => {
        const ca = crearIdentidad({ cn: 'CA de prueba', ca: true });
        const hoja = crearIdentidad({ cn: 'Hoja', emisor: ca });
        const otraCa = crearIdentidad({ cn: 'Otra CA', ca: true });
        const hojaAjena = crearIdentidad({ cn: 'Hoja ajena', emisor: otraCa });
        delete config['DGII_AUTH_CERT_FINGERPRINTS'];
        config['DGII_AUTH_CA_CERTS_BASE64'] = Buffer.from(ca.certPem).toString('base64');

        expect(servicio.validarSemillaFirmada(firmar(servicio.generarSemilla().xml, hoja)).token).toBeTruthy();
        expect(() => servicio.validarSemillaFirmada(firmar(servicio.generarSemilla().xml, hojaAjena))).toThrow('no es de confianza');
      });
    });
  });

  describe('token', () => {
    const emitir = () => servicio.validarSemillaFirmada(firmar(servicio.generarSemilla().xml, cliente));

    it('rechaza token ausente, mal formado o manipulado', () => {
      const { token } = emitir();
      const [cuerpo, mac] = token.split('.');
      const payloadFalso = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(cuerpo, 'base64url').toString()), exp: 9_999_999_999 })).toString('base64url');

      expect(() => servicio.validarToken(undefined)).toThrow('Falta el token');
      expect(() => servicio.validarToken('basura')).toThrow('Token inválido');
      expect(() => servicio.validarToken(`${payloadFalso}.${mac}`)).toThrow('Token inválido');
      expect(() => servicio.validarToken(`${cuerpo}.${mac.slice(0, -2)}xx`)).toThrow('Token inválido');
    });

    it('vence a la hora (y un token de otro secreto no sirve)', () => {
      const { token } = emitir();
      expect(() => servicio.validarToken(token, new Date(Date.now() + 3_601_000))).toThrow('vencido');

      config['DGII_AUTH_TOKEN_SECRET'] = 'otro-secreto-distinto-largo-largo-largo';
      const otro = new DgiiAutenticacionService({ get: (k: string) => config[k] } as unknown as ConfigService);
      expect(() => otro.validarToken(token)).toThrow('Token inválido');
    });

    it('DGII_AUTH_TOKEN_TTL_SECONDS acota la vigencia entre 60 y 3600 s', () => {
      config['DGII_AUTH_TOKEN_TTL_SECONDS'] = '120';
      const a = emitir();
      expect(new Date(a.expira).getTime() - new Date(a.expedido).getTime()).toBe(120_000);

      config['DGII_AUTH_TOKEN_TTL_SECONDS'] = '999999';
      const b = new DgiiAutenticacionService({ get: (k: string) => config[k] } as unknown as ConfigService);
      const r = b.validarSemillaFirmada(firmar(b.generarSemilla().xml, cliente));
      expect(new Date(r.expira).getTime() - new Date(r.expedido).getTime()).toBe(3_600_000);
    });
  });

  describe('HTTP: rutas /fe/autenticacion/api/* y rutas protegidas', () => {
    let app: INestApplication;
    const receptor = { procesarRecepcion: jest.fn().mockResolvedValue('<ARECF/>'), procesarAprobacionComercial: jest.fn() };

    beforeEach(async () => {
      const cfg = { get: (k: string) => config[k] } as unknown as ConfigService;
      const modulo = await Test.createTestingModule({
        controllers: [DgiiAutenticacionController, DgiiWebhookController],
        providers: [
          DgiiTokenGuard,
          { provide: ConfigService, useValue: cfg },
          DgiiAutenticacionService,
          { provide: DgiiReceptorService, useValue: receptor },
        ],
      }).compile();
      app = modulo.createNestApplication();
      app.use(text({ type: ['application/xml', 'text/xml'] }));
      await app.init();
    });
    afterEach(async () => {
      await app.close();
    });

    const obtenerToken = async () => {
      const semilla = await request(app.getHttpServer()).get('/fe/autenticacion/api/semilla').expect(200);
      const r = await request(app.getHttpServer())
        .post('/fe/autenticacion/api/validacioncertificado')
        .attach('xml', Buffer.from(firmar(semilla.text, cliente)), { filename: 'semilla.xml', contentType: 'text/xml' })
        .expect(200);
      return r.body.token as string;
    };

    it('GET semilla devuelve XML', async () => {
      const r = await request(app.getHttpServer()).get('/fe/autenticacion/api/semilla').expect(200);
      expect(r.headers['content-type']).toContain('application/xml');
      expect(valorDe(r.text)).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('flujo completo: semilla → firma → validacioncertificado devuelve token JSON', async () => {
      const token = await obtenerToken();
      expect(token).toBeTruthy();
    });

    it('validacioncertificado responde XML si el cliente lo pide, y acepta el XML como cuerpo plano', async () => {
      const semilla = await request(app.getHttpServer()).get('/fe/autenticacion/api/semilla');
      const r = await request(app.getHttpServer())
        .post('/fe/autenticacion/api/validacioncertificado')
        .set('Content-Type', 'application/xml')
        .set('Accept', 'application/xml')
        .send(firmar(semilla.text, cliente))
        .expect(200);
      expect(r.headers['content-type']).toContain('application/xml');
      expect(r.text).toMatch(/<RespuestaAutenticacion><token>.+<\/token><expira>.+<\/expira><expedido>.+<\/expedido><\/RespuestaAutenticacion>/);
    });

    it('validacioncertificado sin XML → 400; con firma de un certificado no permitido → 401', async () => {
      await request(app.getHttpServer()).post('/fe/autenticacion/api/validacioncertificado').expect(400);

      const intruso = crearIdentidad({ cn: 'Intruso' });
      const semilla = await request(app.getHttpServer()).get('/fe/autenticacion/api/semilla');
      await request(app.getHttpServer())
        .post('/fe/autenticacion/api/validacioncertificado')
        .attach('xml', Buffer.from(firmar(semilla.text, intruso)), 'semilla.xml')
        .expect(401);
    });

    it('con DGII_WEBHOOK_AUTH_REQUIRED=false (por defecto) la recepción NO pide token', async () => {
      await request(app.getHttpServer()).post('/dgii/webhook/recepcion').set('Content-Type', 'application/xml').send('<ECF/>').expect(200);
    });

    it('con DGII_WEBHOOK_AUTH_REQUIRED=true exige un token válido en recepción y aprobación comercial', async () => {
      config['DGII_WEBHOOK_AUTH_REQUIRED'] = 'true';
      const enviar = (ruta: string, auth?: string) => {
        const req = request(app.getHttpServer()).post(ruta).set('Content-Type', 'application/xml');
        return (auth ? req.set('Authorization', auth) : req).send('<ECF/>');
      };

      await enviar('/dgii/webhook/recepcion').expect(401);
      await enviar('/dgii/webhook/recepcion', 'Bearer basura.basura').expect(401);
      await enviar('/dgii/webhook/aprobacion-comercial', 'Basic abc').expect(401);

      const token = await obtenerToken();
      await enviar('/dgii/webhook/recepcion', `Bearer ${token}`).expect(200);
      await enviar('/dgii/webhook/aprobacion-comercial', `Bearer ${token}`).expect(200);
    });
  });
});
