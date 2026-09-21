import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DgiiReceptorService } from './dgii-receptor.service';
import { EcfRecibido } from '../ecf/entities/ecf-recibido.entity';
import { Ecf } from '../ecf/entities/ecf.entity';
import { Empresa } from '../empresa/entities/empresa.entity';
import { EcfSigningService } from '../ecf/services/ecf-signing.service';
import { DgiiService } from './dgii.service';
import { verificarFirmaXml } from './verificar-firma-xml';

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

jest.mock('./verificar-firma-xml', () => ({
  verificarFirmaXml: jest.fn(),
}));
const mockVerificarFirmaXml = verificarFirmaXml as jest.Mock;

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
  let dgiiService: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockVerificarFirmaXml.mockReturnValue(true);

    ecfRecibidoRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockImplementation((data) => Promise.resolve(data)),
      find: jest.fn().mockResolvedValue([]),
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
    dgiiService = {
      enviarAprobacionComercial: jest.fn().mockResolvedValue({ codigo: '01', estado: 'Aprobación Comercial Aprobada.', mensaje: [] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DgiiReceptorService,
        { provide: getRepositoryToken(EcfRecibido), useValue: ecfRecibidoRepository },
        { provide: getRepositoryToken(Ecf), useValue: ecfRepository },
        { provide: getRepositoryToken(Empresa), useValue: empresaRepository },
        { provide: EcfSigningService, useValue: signingService },
        { provide: DgiiService, useValue: dgiiService },
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

    it('responde "no recibido" (código 2) si la firma digital del XML no es válida', async () => {
      mockSimpleXMLParseBody.mockReturnValue(fakeDoc(camposValidos));
      mockVerificarFirmaXml.mockReturnValue(false);
      mockGetECFDataFromXML.mockReturnValue('<ARECF>firma invalida</ARECF>');

      await service.procesarRecepcion('<ECF>...</ECF>');

      expect(mockGetECFDataFromXML).toHaveBeenCalledWith(expect.anything(), '132943058', '1', '2');
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

  describe('listar / obtener', () => {
    it('listar devuelve los e-CF recibidos ordenados por más reciente', async () => {
      ecfRecibidoRepository.find.mockResolvedValue([{ id: '1' }]);

      const resultado = await service.listar();

      expect(ecfRecibidoRepository.find).toHaveBeenCalledWith({ order: { createdAt: 'DESC' } });
      expect(resultado).toEqual([{ id: '1' }]);
    });

    it('obtener lanza NotFoundException si no existe', async () => {
      ecfRecibidoRepository.findOne.mockResolvedValue(null);

      await expect(service.obtener('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  describe('emitirAprobacionComercial', () => {
    const recibidoBase: any = {
      id: 'rec-1',
      rncEmisor: '101672919',
      rncComprador: '132943058',
      encf: 'E310000000001',
      fechaEmision: new Date('2026-09-15'),
      createdAt: new Date('2026-09-15'),
      montoTotal: '1180.00',
      aprobacionComercial: 'pendiente',
    };

    it('firma y envía el ACECF de aceptación, y marca el e-CF recibido como aceptado', async () => {
      ecfRecibidoRepository.findOne.mockResolvedValue({ ...recibidoBase });

      const resultado = await service.emitirAprobacionComercial('rec-1', 'aceptado');

      expect(signingService.signXml).toHaveBeenCalledWith(expect.stringContaining('<Estado>1</Estado>'), 'ACECF');
      expect(dgiiService.enviarAprobacionComercial).toHaveBeenCalled();
      expect(ecfRecibidoRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ aprobacionComercial: 'aceptado' }),
      );
      expect(resultado.aprobacionComercial).toBe('aceptado');
    });

    it('firma y envía el ACECF de rechazo con el motivo', async () => {
      ecfRecibidoRepository.findOne.mockResolvedValue({ ...recibidoBase });

      await service.emitirAprobacionComercial('rec-1', 'rechazado', 'Producto no coincide');

      const xmlFirmado = signingService.signXml.mock.calls[0][0];
      expect(xmlFirmado).toContain('<Estado>2</Estado>');
      expect(xmlFirmado).toContain('Producto no coincide');
    });

    it('lanza BadRequestException si se rechaza sin motivo', async () => {
      ecfRecibidoRepository.findOne.mockResolvedValue({ ...recibidoBase });

      await expect(service.emitirAprobacionComercial('rec-1', 'rechazado')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lanza BadRequestException si ya tenía una aprobación comercial registrada', async () => {
      ecfRecibidoRepository.findOne.mockResolvedValue({ ...recibidoBase, aprobacionComercial: 'aceptado' });

      await expect(service.emitirAprobacionComercial('rec-1', 'rechazado', 'motivo')).rejects.toThrow(
        BadRequestException,
      );
      expect(dgiiService.enviarAprobacionComercial).not.toHaveBeenCalled();
    });

    it('lanza NotFoundException si el e-CF recibido no existe', async () => {
      ecfRecibidoRepository.findOne.mockResolvedValue(null);

      await expect(service.emitirAprobacionComercial('no-existe', 'aceptado')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
