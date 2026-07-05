import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DgiiService } from './dgii.service';
import { DgiiCertificateService } from './dgii-certificate.service';
import { EcfAnulacionService } from '../ecf/services/ecf-anulacion.service';
import { EcfSigningService } from '../ecf/services/ecf-signing.service';

const mockAuthenticate = jest.fn();
const mockSendElectronicDocument = jest.fn();
const mockSendSummary = jest.fn();
const mockStatusTrackId = jest.fn();
const mockVoidENCF = jest.fn();
const mockSetAuthToken = jest.fn();
const mockConvertECF32ToRFCE = jest.fn();
const mockSignXml = jest.fn();

jest.mock('dgii-ecf', () => {
  return {
    __esModule: true,
    ENVIRONMENT: { DEV: 'dev', TEST: 'test', CERT: 'cert', PROD: 'prod' },
    setAuthToken: (...args: any[]) => mockSetAuthToken(...args),
    convertECF32ToRFCE: (...args: any[]) => mockConvertECF32ToRFCE(...args),
    Signature: jest.fn().mockImplementation(() => ({
      signXml: (...args: any[]) => mockSignXml(...args),
    })),
    default: jest.fn().mockImplementation(() => ({
      authenticate: mockAuthenticate,
      sendElectronicDocument: mockSendElectronicDocument,
      sendSummary: mockSendSummary,
      statusTrackId: mockStatusTrackId,
      voidENCF: mockVoidENCF,
    })),
  };
});

describe('DgiiService', () => {
  let service: DgiiService;
  let mockCertificateService: any;
  let mockAnulacionService: any;
  let mockSigningService: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockCertificateService = {
      usaCertificadoReal: jest.fn().mockResolvedValue(false),
      getP12ReaderData: jest.fn().mockResolvedValue({ key: 'key-pem', cert: 'cert-pem' }),
    };

    mockAnulacionService = {
      generateXmlParaUnEncf: jest.fn().mockReturnValue('<ANECF></ANECF>'),
    };

    mockSigningService = {
      signXml: jest.fn().mockResolvedValue('<ANECF><ds:Signature/></ANECF>'),
    };

    const mockConfigService = {
      get: jest.fn().mockReturnValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DgiiService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: DgiiCertificateService, useValue: mockCertificateService },
        { provide: EcfAnulacionService, useValue: mockAnulacionService },
        { provide: EcfSigningService, useValue: mockSigningService },
      ],
    }).compile();

    service = module.get<DgiiService>(DgiiService);
  });

  describe('authenticate (modo mock, sin certificado real)', () => {
    it('devuelve un token simulado sin llamar a la DGII', async () => {
      const result = await service.authenticate('101000001', 'usuario', 'clave');

      expect(result.token).toMatch(/^mock-token-/);
      expect(result.expiresIn).toBe(3600);
      expect(mockAuthenticate).not.toHaveBeenCalled();
    });
  });

  describe('authenticate (modo real)', () => {
    beforeEach(() => {
      mockCertificateService.usaCertificadoReal.mockResolvedValue(true);
    });

    it('devuelve el token y expiresIn calculado cuando la DGII responde', async () => {
      const expira = new Date(Date.now() + 3600_000).toISOString();
      mockAuthenticate.mockResolvedValue({ token: 'tok-real', expira });

      const result = await service.authenticate('101000001', 'usuario', 'clave');

      expect(result.token).toBe('tok-real');
      expect(result.expiresIn).toBeGreaterThan(0);
    });

    it('lanza HttpException si la DGII no devuelve token', async () => {
      mockAuthenticate.mockResolvedValue(undefined);

      await expect(service.authenticate('101000001', 'usuario', 'clave')).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('transmitEcf (modo mock)', () => {
    it('devuelve una respuesta simulada de aceptación sin llamar a la DGII', async () => {
      const ecf = { rncEmisor: '101000001', encf: 'E310000000001', xmlFirmado: '<ECF/>' } as any;

      const result = await service.transmitEcf(ecf, 'tok-123');

      expect(result.codigo).toBe('200');
      expect(mockSendElectronicDocument).not.toHaveBeenCalled();
    });
  });

  describe('transmitEcf (modo real)', () => {
    beforeEach(() => {
      mockCertificateService.usaCertificadoReal.mockResolvedValue(true);
    });

    it('rechaza si el e-CF no tiene xmlFirmado o encf', async () => {
      const ecf = { rncEmisor: '101000001', encf: undefined, xmlFirmado: undefined } as any;

      await expect(service.transmitEcf(ecf, 'tok-123')).rejects.toThrow(HttpException);
      expect(mockSendElectronicDocument).not.toHaveBeenCalled();
    });

    it('transmite un e-CF normal con sendElectronicDocument y devuelve el trackId', async () => {
      const ecf = {
        rncEmisor: '101000001',
        encf: 'E310000000001',
        tipoEcf: 'e-CF_31_v_1_0',
        montoTotal: 1000,
        xmlFirmado: '<ECF/>',
      } as any;
      mockSendElectronicDocument.mockResolvedValue({
        trackId: 'track-abc',
        mensajes: [{ valor: 'Recibido' }],
      });

      const result = await service.transmitEcf(ecf, 'tok-123');

      expect(mockSetAuthToken).toHaveBeenCalledWith('tok-123');
      expect(result.uuid).toBe('track-abc');
      expect(result.mensajes).toEqual(['Recibido']);
    });

    it('lanza HttpException si la DGII no devuelve trackId', async () => {
      const ecf = {
        rncEmisor: '101000001',
        encf: 'E310000000001',
        tipoEcf: 'e-CF_31_v_1_0',
        montoTotal: 1000,
        xmlFirmado: '<ECF/>',
      } as any;
      mockSendElectronicDocument.mockResolvedValue({ error: 'Rechazado por la DGII' });

      await expect(service.transmitEcf(ecf, 'tok-123')).rejects.toThrow(HttpException);
    });

    it('envía un e-CF 32 por debajo de RD$250,000 como RFCE (sendSummary)', async () => {
      const ecf = {
        rncEmisor: '101000001',
        encf: 'E320000000001',
        tipoEcf: 'e-CF_32_v_1_0',
        montoTotal: 5000,
        xmlFirmado: '<ECF/>',
      } as any;
      mockConvertECF32ToRFCE.mockReturnValue({ xml: '<RFCE/>' });
      mockSignXml.mockReturnValue('<RFCE><ds:Signature/></RFCE>');
      mockSendSummary.mockResolvedValue({ codigo: '200', mensajes: [{ valor: 'Resumen aceptado' }] });

      const result = await service.transmitEcf(ecf, 'tok-123');

      expect(mockConvertECF32ToRFCE).toHaveBeenCalledWith('<ECF/>');
      expect(mockSendSummary).toHaveBeenCalledWith('<RFCE><ds:Signature/></RFCE>', expect.any(String));
      expect(result.uuid).toBe('E320000000001');
      expect(result.mensajes).toEqual(['Resumen aceptado']);
      expect(mockSendElectronicDocument).not.toHaveBeenCalled();
    });

    it('transmite un e-CF 32 de RD$250,000 o más como documento completo (no RFCE)', async () => {
      const ecf = {
        rncEmisor: '101000001',
        encf: 'E320000000002',
        tipoEcf: 'e-CF_32_v_1_0',
        montoTotal: 250_000,
        xmlFirmado: '<ECF/>',
      } as any;
      mockSendElectronicDocument.mockResolvedValue({ trackId: 'track-xyz', mensajes: [] });

      const result = await service.transmitEcf(ecf, 'tok-123');

      expect(mockSendSummary).not.toHaveBeenCalled();
      expect(result.uuid).toBe('track-xyz');
    });
  });

  describe('queryEcfStatus', () => {
    it('modo mock: devuelve un estado simulado sin llamar a la DGII', async () => {
      const result = await service.queryEcfStatus('track-abc', 'tok-123');

      expect(result.estado).toBe('Aceptado');
      expect(mockStatusTrackId).not.toHaveBeenCalled();
    });

    it('modo real: devuelve el estado consultado a la DGII', async () => {
      mockCertificateService.usaCertificadoReal.mockResolvedValue(true);
      mockStatusTrackId.mockResolvedValue({
        estado: 'Rechazado',
        codigo: '400',
        mensajes: [{ valor: 'RNC comprador inválido' }],
      });

      const result = await service.queryEcfStatus('track-abc', 'tok-123');

      expect(mockSetAuthToken).toHaveBeenCalledWith('tok-123');
      expect(result.estado).toBe('Rechazado');
      expect(result.mensaje).toBe('RNC comprador inválido');
    });

    it('modo real: lanza HttpException si la DGII no devuelve estado', async () => {
      mockCertificateService.usaCertificadoReal.mockResolvedValue(true);
      mockStatusTrackId.mockResolvedValue(undefined);

      await expect(service.queryEcfStatus('track-abc', 'tok-123')).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('cancelEcf', () => {
    it('modo mock: devuelve una cancelación simulada sin llamar a la DGII', async () => {
      const result = await service.cancelEcf('track-abc', 'motivo', 'tok-123');

      expect(result.estado).toBe('Cancelado');
      expect(mockVoidENCF).not.toHaveBeenCalled();
    });

    it('modo real: rechaza si no se provee el rango a anular', async () => {
      mockCertificateService.usaCertificadoReal.mockResolvedValue(true);

      await expect(service.cancelEcf('track-abc', 'motivo', 'tok-123')).rejects.toThrow(
        HttpException,
      );
      expect(mockVoidENCF).not.toHaveBeenCalled();
    });

    it('modo real: genera y firma el ANECF, y anula el eNCF vía voidENCF', async () => {
      mockCertificateService.usaCertificadoReal.mockResolvedValue(true);
      mockVoidENCF.mockResolvedValue({
        codigo: '200',
        mensajes: ['Anulado correctamente'],
        rnc: '101000001',
        nombre: 'Empresa Emisora',
      });

      const result = await service.cancelEcf('track-abc', 'motivo', 'tok-123', {
        rncEmisor: '101000001',
        tipoEcf: 31,
        encf: 'E310000000001',
      });

      expect(mockAnulacionService.generateXmlParaUnEncf).toHaveBeenCalledWith(
        '101000001',
        31,
        'E310000000001',
      );
      expect(mockSigningService.signXml).toHaveBeenCalledWith('<ANECF></ANECF>', 'ANECF');
      expect(mockVoidENCF).toHaveBeenCalled();
      expect(result.estado).toBe('Cancelado');
      expect(result.codigo).toBe('200');
    });

    it('modo real: lanza HttpException si la DGII no devuelve respuesta', async () => {
      mockCertificateService.usaCertificadoReal.mockResolvedValue(true);
      mockVoidENCF.mockResolvedValue(undefined);

      await expect(
        service.cancelEcf('track-abc', 'motivo', 'tok-123', {
          rncEmisor: '101000001',
          tipoEcf: 31,
          encf: 'E310000000001',
        }),
      ).rejects.toThrow(HttpException);
    });
  });
});
