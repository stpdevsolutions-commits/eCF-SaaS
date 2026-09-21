import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DgiiReceptorService } from './dgii-receptor.service';
import { EcfRecibido } from '../ecf/entities/ecf-recibido.entity';
import { Ecf } from '../ecf/entities/ecf.entity';
import { Empresa } from '../empresa/entities/empresa.entity';
import { EcfSigningService } from '../ecf/services/ecf-signing.service';

const mockSimpleXMLParseBody = jest.fn();
const mockGetECFDataFromXML = jest.fn();

jest.mock('dgii-ecf', () => ({
  __esModule: true,
  SenderReceiver: jest.fn().mockImplementation(() => ({
    simpleXMLParseBody: (...args: any[]) => mockSimpleXMLParseBody(...args),
    getECFDataFromXML: (...args: any[]) => mockGetECFDataFromXML(...args),
  })),
  NoReceivedCode: {
    'Error de especificación': '1',
    'Error de Firma Digital': '2',
    'Envío duplicado': '3',
    'RNC Comprador no corresponde': '4',
  },
  ReceivedStatus: {
    'e-CF Recibido': '0',
    'e-CF No Recibido': '1',
  },
}));

/** Simula el Document que devuelve simpleXMLParseBody, respaldado en un mapa tag -> valor. */
function fakeDoc(campos: Record<string, string>): any {
  return {
    getElementsByTagName: (tag: string) =>
      campos[tag] !== undefined ? [{ textContent: campos[tag] }] : [],
  };
}

describe('DgiiReceptorService', () => {
  let service: DgiiReceptorService;
  let ecfRecibidoRepository: any;
  let ecfRepository: any;
  let empresaRepository: any;
  let signingService: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    ecfRecibidoRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockResolvedValue(undefined),
    };
    ecfRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(undefined),
    };
    empresaRepository = {
      findOne: jest.fn().mockResolvedValue({ rnc: '132943058', certificadoDgii: true }),
    };
    signingService = {
      signXml: jest.fn().mockImplementation((xml: string) => Promise.resolve(`${xml}<Signature/>`)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DgiiReceptorService,
        { provide: getRepositoryToken(EcfRecibido), useValue: ecfRecibidoRepository },
        { provide: getRepositoryToken(Ecf), useValue: ecfRepository },
        { provide: getRepositoryToken(Empresa), useValue: empresaRepository },
        { provide: EcfSigningService, useValue: signingService },
      ],
    }).compile();

    service = module.get(DgiiReceptorService);
  });

  describe('procesarRecepcion', () => {
    const camposValidos = {
      RNCEmisor: '101672919',
      RNCComprador: '132943058',
      eNCF: 'E310000000001',
      TipoeCF: '31',
      FechaEmision: '15-09-2026',
      MontoTotal: '1180.00',
    };

    it('guarda el e-CF recibido y devuelve el Acuse de Recibo firmado', async () => {
      mockSimpleXMLParseBody.mockReturnValue(fakeDoc(camposValidos));
      mockGetECFDataFromXML.mockReturnValue('<ARECF>sin firmar</ARECF>');

      const resultado = await service.procesarRecepcion('<ECF>...</ECF>');

      expect(mockGetECFDataFromXML).toHaveBeenCalledWith(
        expect.anything(),
        '132943058',
        '0',
        undefined,
      );
      expect(signingService.signXml).toHaveBeenCalledWith('<ARECF>sin firmar</ARECF>', 'ARECF');
      expect(ecfRecibidoRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ rncEmisor: '101672919', encf: 'E310000000001', estadoAcuse: 'recibido' }),
      );
      expect(resultado).toBe('<ARECF>sin firmar</ARECF><Signature/>');
    });

    it('responde "no recibido" (código 4) si el RNC comprador del XML no es el nuestro', async () => {
      mockSimpleXMLParseBody.mockReturnValue(
        fakeDoc({ ...camposValidos, RNCComprador: '999999999' }),
      );
      mockGetECFDataFromXML.mockReturnValue('<ARECF>rechazo</ARECF>');

      await service.procesarRecepcion('<ECF>...</ECF>');

      expect(mockGetECFDataFromXML).toHaveBeenCalledWith(expect.anything(), '132943058', '1', '4');
      expect(ecfRecibidoRepository.save).not.toHaveBeenCalled();
    });

    it('responde "no recibido" (código 3) si el eNCF ya fue procesado antes', async () => {
      mockSimpleXMLParseBody.mockReturnValue(fakeDoc(camposValidos));
      ecfRecibidoRepository.findOne.mockResolvedValue({ id: 'existing' });
      mockGetECFDataFromXML.mockReturnValue('<ARECF>duplicado</ARECF>');

      await service.procesarRecepcion('<ECF>...</ECF>');

      expect(mockGetECFDataFromXML).toHaveBeenCalledWith(expect.anything(), '132943058', '1', '3');
      expect(ecfRecibidoRepository.save).not.toHaveBeenCalled();
    });

    it('lanza BadRequestException si falta RNCEmisor o eNCF', async () => {
      mockSimpleXMLParseBody.mockReturnValue(fakeDoc({ RNCComprador: '132943058' }));

      await expect(service.procesarRecepcion('<ECF/>')).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si no hay empresa con certificado DGII activo', async () => {
      mockSimpleXMLParseBody.mockReturnValue(fakeDoc(camposValidos));
      empresaRepository.findOne.mockResolvedValue(null);

      await expect(service.procesarRecepcion('<ECF/>')).rejects.toThrow(BadRequestException);
    });
  });

  describe('procesarAprobacionComercial', () => {
    it('marca el e-CF como aceptado cuando Estado=1', async () => {
      mockSimpleXMLParseBody.mockReturnValue(
        fakeDoc({ eNCF: 'E310000000001', Estado: '1' }),
      );
      const ecfExistente: any = { encf: 'E310000000001', aprobacionComercial: 'pendiente' };
      ecfRepository.findOne.mockResolvedValue(ecfExistente);

      await service.procesarAprobacionComercial('<ACECF/>');

      expect(ecfRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ aprobacionComercial: 'aceptado' }),
      );
    });

    it('marca el e-CF como rechazado cuando Estado=2, con el detalle del motivo', async () => {
      mockSimpleXMLParseBody.mockReturnValue(
        fakeDoc({ eNCF: 'E310000000001', Estado: '2', DetalleMotivoRechazo: 'Precio incorrecto' }),
      );
      const ecfExistente: any = { encf: 'E310000000001', aprobacionComercial: 'pendiente' };
      ecfRepository.findOne.mockResolvedValue(ecfExistente);

      await service.procesarAprobacionComercial('<ACECF/>');

      expect(ecfRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          aprobacionComercial: 'rechazado',
          detalleMotivoRechazoAprobacion: 'Precio incorrecto',
        }),
      );
    });

    it('no lanza error si el eNCF no corresponde a ningún e-CF propio (solo lo ignora)', async () => {
      mockSimpleXMLParseBody.mockReturnValue(fakeDoc({ eNCF: 'E319999999999', Estado: '1' }));
      ecfRepository.findOne.mockResolvedValue(null);

      await expect(service.procesarAprobacionComercial('<ACECF/>')).resolves.toBeUndefined();
      expect(ecfRepository.save).not.toHaveBeenCalled();
    });

    it('lanza BadRequestException si falta eNCF', async () => {
      mockSimpleXMLParseBody.mockReturnValue(fakeDoc({ Estado: '1' }));

      await expect(service.procesarAprobacionComercial('<ACECF/>')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
