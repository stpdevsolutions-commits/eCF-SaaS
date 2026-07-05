import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EcfService } from './ecf.service';
import { Ecf } from '../entities/ecf.entity';
import { LineaEcf } from '../entities/linea-ecf.entity';
import { Empresa } from '../../empresa/entities/empresa.entity';
import { XsdValidatorService } from '../../validation/xsd-validator.service';
import { EcfXmlService } from './ecf-xml.service';
import { EcfSigningService } from './ecf-signing.service';
import { NcfSequenceService } from './ncf-sequence.service';
import { DgiiService } from '../../dgii/dgii.service';

function mockQueryBuilder(comprobantes: any[]) {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(comprobantes),
  };
}

describe('EcfService', () => {
  let service: EcfService;
  let mockEcfRepository: any;
  let mockLineaRepository: any;
  let mockEmpresaRepository: any;
  let mockValidatorService: any;
  let mockXmlService: any;
  let mockSigningService: any;
  let mockNcfSequenceService: any;
  let mockDgiiService: any;

  beforeEach(async () => {
    mockEcfRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    mockLineaRepository = {
      create: jest.fn(),
      save: jest.fn(),
    };

    mockEmpresaRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'empresa-id',
        rnc: '101000001',
        razonSocial: 'Empresa Emisora',
        direccion: 'Calle Falsa 123',
      }),
    };

    mockDgiiService = {
      transmitEcf: jest.fn(),
      queryEcfStatus: jest.fn(),
      cancelEcf: jest.fn(),
    };

    mockValidatorService = {
      validateEcf: jest.fn().mockReturnValue({
        valid: true,
        errors: [],
        warnings: [],
      }),
      validateXmlStructure: jest.fn().mockReturnValue({
        valid: true,
        errors: [],
        warnings: [],
      }),
      calculateLineTotal: jest.fn().mockReturnValue({
        subtotal: 1000,
        itbis: 180,
        total: 1180,
      }),
    };

    mockXmlService = {
      generateXml: jest.fn().mockReturnValue('<ECF></ECF>'),
      buildEncf: jest.fn(
        (tipoEcf: string, seq: number) =>
          `E${tipoEcf.slice(5, 7)}${String(seq).padStart(10, '0')}`,
      ),
    };

    mockSigningService = {
      signXml: jest.fn().mockReturnValue('<ECF><ds:Signature/></ECF>'),
    };

    mockNcfSequenceService = {
      nextSequence: jest.fn().mockResolvedValue(1),
    };

    const mockConfigService = {
      get: jest.fn().mockReturnValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EcfService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: getRepositoryToken(Ecf),
          useValue: mockEcfRepository,
        },
        {
          provide: getRepositoryToken(LineaEcf),
          useValue: mockLineaRepository,
        },
        {
          provide: getRepositoryToken(Empresa),
          useValue: mockEmpresaRepository,
        },
        {
          provide: XsdValidatorService,
          useValue: mockValidatorService,
        },
        {
          provide: EcfXmlService,
          useValue: mockXmlService,
        },
        {
          provide: EcfSigningService,
          useValue: mockSigningService,
        },
        {
          provide: NcfSequenceService,
          useValue: mockNcfSequenceService,
        },
        {
          provide: DgiiService,
          useValue: mockDgiiService,
        },
      ],
    }).compile();

    service = module.get<EcfService>(EcfService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an ECF', async () => {
      const createDto = {
        tipoEcf: 'e-CF_31_v_1_0',
        rncEmisor: '12345678901',
        nombreEmisor: 'Empresa Emisora',
        rncComprador: '98765432109',
        nombreComprador: 'Empresa Compradora',
        lineas: [
          {
            descripcion: 'Producto A',
            cantidad: 1,
            precioUnitario: 1000,
          },
        ],
      };

      const mockEcf = {
        id: '1',
        ...createDto,
        montoTotal: 1180,
      };

      mockEcfRepository.create.mockReturnValue(mockEcf);
      mockEcfRepository.save.mockResolvedValue(mockEcf);
      mockLineaRepository.create.mockReturnValue({});
      mockLineaRepository.save.mockResolvedValue([]);

      const result = await service.create(createDto as any, 'user-id', 'empresa-id');

      expect(result).toBeDefined();
      expect(mockValidatorService.validateEcf).toHaveBeenCalled();
    });

    it('asigna la empresa (scoping) y el usuario creador al crear', async () => {
      const createDto = {
        tipoEcf: 'e-CF_31_v_1_0',
        rncEmisor: '12345678901',
        nombreEmisor: 'Empresa Emisora',
        rncComprador: '98765432109',
        nombreComprador: 'Cliente',
        lineas: [{ descripcion: 'Producto A', cantidad: 1, precioUnitario: 1000 }],
      };

      mockEcfRepository.create.mockImplementation((data: any) => data);
      mockEcfRepository.save.mockImplementation((data: any) =>
        Promise.resolve({ id: '1', ...data }),
      );
      mockLineaRepository.create.mockReturnValue({});
      mockLineaRepository.save.mockResolvedValue({});

      await service.create(createDto as any, 'user-id', 'empresa-id');

      expect(mockEcfRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          empresaId: 'empresa-id',
          usuario: { id: 'user-id' },
          rncEmisor: '101000001',
          nombreEmisor: 'Empresa Emisora',
        }),
      );
    });
  });

  describe('validateEcf', () => {
    it('should validate ECF', async () => {
      const mockEcf = {
        id: '1',
        tipoEcf: 'e-CF_31_v_1_0',
        rncEmisor: '12345678901',
        rncComprador: '98765432109',
        estado: 'draft',
        empresaId: 'empresa-id',
      };

      mockEcfRepository.findOne.mockResolvedValue(mockEcf);
      mockEcfRepository.save.mockResolvedValue(mockEcf);

      const result = await service.validateEcf('1', 'empresa-id');

      expect(result.valid).toBe(true);
    });
  });

  describe('scoping por empresa', () => {
    it('findOne busca por (id, empresaId), no por usuario', async () => {
      mockEcfRepository.findOne.mockResolvedValue({ id: '1', empresaId: 'empresa-A' });

      await service.findOne('1', 'empresa-A');

      expect(mockEcfRepository.findOne).toHaveBeenCalledWith({
        where: { id: '1', empresaId: 'empresa-A' },
        relations: ['lineas'],
      });
    });

    it('findOne lanza NotFound si el e-CF pertenece a otra empresa', async () => {
      mockEcfRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('1', 'otra-empresa')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('findAll filtra por empresa_id', async () => {
      const qb = mockQueryBuilder([]);
      mockEcfRepository.createQueryBuilder.mockReturnValue(qb);

      await service.findAll('empresa-A');

      expect(qb.where).toHaveBeenCalledWith('ecf.empresa_id = :empresaId', {
        empresaId: 'empresa-A',
      });
    });

    it('getResumen filtra por empresa_id', async () => {
      const qb = mockQueryBuilder([]);
      mockEcfRepository.createQueryBuilder.mockReturnValue(qb);

      await service.getResumen('empresa-A');

      expect(qb.where).toHaveBeenCalledWith('ecf.empresa_id = :empresaId', {
        empresaId: 'empresa-A',
      });
    });
  });

  describe('asignación de secuencia eNCF', () => {
    const baseEcf = (extra: Record<string, any> = {}): any => ({
      id: '1',
      tipoEcf: 'e-CF_31_v_1_0',
      estado: 'draft',
      encf: null,
      xmlValidacion: null,
      empresaId: 'empresa-id',
      usuario: { id: 'user-id' },
      ...extra,
    });

    beforeEach(() => {
      mockEcfRepository.save.mockImplementation((data: any) => Promise.resolve(data));
    });

    it('asigna una secuencia nueva al validar y persiste el eNCF', async () => {
      const ecf = baseEcf();
      mockEcfRepository.findOne.mockResolvedValue(ecf);
      mockNcfSequenceService.nextSequence.mockResolvedValue(7);

      const result = await service.validateEcf('1', 'empresa-id');

      expect(mockNcfSequenceService.nextSequence).toHaveBeenCalledTimes(1);
      expect(mockNcfSequenceService.nextSequence).toHaveBeenCalledWith(
        'empresa-id',
        'e-CF_31_v_1_0',
      );
      expect(mockXmlService.buildEncf).toHaveBeenCalledWith('e-CF_31_v_1_0', 7);
      expect(ecf.encf).toBe('E310000000007');
      expect(mockEcfRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ encf: 'E310000000007' }),
      );
      expect(result.encf).toBe('E310000000007');
    });

    it('no consume una secuencia nueva al revalidar si el eNCF ya está asignado', async () => {
      const ecf = baseEcf({ estado: 'validated', encf: 'E310000000007' });
      mockEcfRepository.findOne.mockResolvedValue(ecf);

      const result = await service.validateEcf('1', 'empresa-id');

      expect(mockNcfSequenceService.nextSequence).not.toHaveBeenCalled();
      expect(ecf.encf).toBe('E310000000007');
      expect(result.encf).toBe('E310000000007');
    });

    it('al firmar reutiliza el eNCF ya asignado cuando regenera el XML (xmlValidacion null)', async () => {
      const ecf = baseEcf({ estado: 'validated', encf: 'E310000000007' });
      mockEcfRepository.findOne.mockResolvedValue(ecf);

      const result = await service.signEcf('1', 'empresa-id');

      // No debe consumir una secuencia nueva ni cambiar el eNCF asignado
      expect(mockNcfSequenceService.nextSequence).not.toHaveBeenCalled();
      expect(mockXmlService.generateXml).toHaveBeenCalledWith(ecf);
      expect(ecf.encf).toBe('E310000000007');
      expect(result.encf).toBe('E310000000007');
      expect(result.estado).toBe('signed');
    });

    it('al firmar no regenera XML ni consume secuencia si xmlValidacion ya existe', async () => {
      const ecf = baseEcf({
        estado: 'validated',
        encf: 'E310000000007',
        xmlValidacion: '<ECF>validado</ECF>',
      });
      mockEcfRepository.findOne.mockResolvedValue(ecf);

      await service.signEcf('1', 'empresa-id');

      expect(mockNcfSequenceService.nextSequence).not.toHaveBeenCalled();
      expect(mockXmlService.generateXml).not.toHaveBeenCalled();
      expect(mockSigningService.signXml).toHaveBeenCalledWith('<ECF>validado</ECF>');
    });

    it('al firmar sin validación previa (sin encf ni xmlValidacion) asigna la secuencia una vez', async () => {
      const ecf = baseEcf();
      mockEcfRepository.findOne.mockResolvedValue(ecf);
      mockNcfSequenceService.nextSequence.mockResolvedValue(3);

      const result = await service.signEcf('1', 'empresa-id');

      expect(mockNcfSequenceService.nextSequence).toHaveBeenCalledTimes(1);
      expect(ecf.encf).toBe('E310000000003');
      expect(result.encf).toBe('E310000000003');
    });

    it('dos comprobantes del mismo tipo obtienen eNCF distintos', async () => {
      const ecf1 = baseEcf({ id: '1' });
      const ecf2 = baseEcf({ id: '2' });
      mockEcfRepository.findOne
        .mockResolvedValueOnce(ecf1)
        .mockResolvedValueOnce(ecf2);
      mockNcfSequenceService.nextSequence
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2);

      await service.validateEcf('1', 'empresa-id');
      await service.validateEcf('2', 'empresa-id');

      expect(mockNcfSequenceService.nextSequence).toHaveBeenCalledTimes(2);
      expect(ecf1.encf).toBe('E310000000001');
      expect(ecf2.encf).toBe('E310000000002');
      expect(ecf1.encf).not.toBe(ecf2.encf);
    });
  });

  describe('create — rechazo por validación', () => {
    it('lanza BadRequestException si el DTO no pasa validateEcf', async () => {
      mockValidatorService.validateEcf.mockReturnValueOnce({
        valid: false,
        errors: ['e-CF_41 requiere indicadorAgenteRetencionoPercepcion'],
        warnings: [],
      });

      await expect(
        service.create({ lineas: [] } as any, 'user-id', 'empresa-id'),
      ).rejects.toThrow(BadRequestException);

      expect(mockEcfRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('create — retenciones', () => {
    it('suma montoItbisRetenido y montoRentaRetenido desde las líneas', async () => {
      const createDto = {
        tipoEcf: 'e-CF_41_v_1_0',
        rncEmisor: '12345678901',
        nombreEmisor: 'Empresa Emisora',
        rncComprador: '98765432109',
        nombreComprador: 'Suplidor Informal',
        lineas: [
          {
            descripcion: 'Servicio de plomería',
            cantidad: 1,
            precioUnitario: 1000,
            indicadorAgenteRetencionoPercepcion: 1,
            montoItbisRetenido: 50,
            montoIsrRetenido: 100,
          },
        ],
      };

      mockEcfRepository.create.mockImplementation((data: any) => data);
      mockEcfRepository.save.mockImplementation((data: any) =>
        Promise.resolve({ id: '1', ...data }),
      );
      mockLineaRepository.create.mockReturnValue({});
      mockLineaRepository.save.mockResolvedValue({});

      await service.create(createDto as any, 'user-id', 'empresa-id');

      expect(mockEcfRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ montoItbisRetenido: 50, montoRentaRetenido: 100 }),
      );
    });

    it('deja las retenciones en 0 cuando la línea no las especifica', async () => {
      const createDto = {
        tipoEcf: 'e-CF_31_v_1_0',
        rncEmisor: '12345678901',
        nombreEmisor: 'Empresa Emisora',
        rncComprador: '98765432109',
        nombreComprador: 'Cliente',
        lineas: [{ descripcion: 'Producto A', cantidad: 1, precioUnitario: 1000 }],
      };

      mockEcfRepository.create.mockImplementation((data: any) => data);
      mockEcfRepository.save.mockImplementation((data: any) =>
        Promise.resolve({ id: '1', ...data }),
      );
      mockLineaRepository.create.mockReturnValue({});
      mockLineaRepository.save.mockResolvedValue({});

      await service.create(createDto as any, 'user-id', 'empresa-id');

      expect(mockEcfRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ montoItbisRetenido: 0, montoRentaRetenido: 0 }),
      );
    });
  });

  describe('getResumen', () => {
    it('agrega totales y agrupa por estado y por tipo', async () => {
      const comprobantes = [
        {
          estado: 'signed',
          tipoEcf: 'e-CF_31_v_1_0',
          montoTotal: '1180.00',
          montoITBIS: '180.00',
          montoItbisRetenido: '0.00',
          montoRentaRetenido: '0.00',
        },
        {
          estado: 'draft',
          tipoEcf: 'e-CF_41_v_1_0',
          montoTotal: '5900.00',
          montoITBIS: '900.00',
          montoItbisRetenido: '0.00',
          montoRentaRetenido: '500.00',
        },
      ];
      mockEcfRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder(comprobantes));

      const result = await service.getResumen('empresa-id');

      expect(result.cantidad).toBe(2);
      expect(result.montoTotal).toBe(7080);
      expect(result.montoITBIS).toBe(1080);
      expect(result.montoRentaRetenido).toBe(500);
      expect(result.porEstado).toEqual({ signed: 1, draft: 1 });
      expect(result.porTipo).toEqual({ 'e-CF_31_v_1_0': 1, 'e-CF_41_v_1_0': 1 });
    });

    it('devuelve ceros y objetos vacíos cuando no hay comprobantes', async () => {
      mockEcfRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder([]));

      const result = await service.getResumen('empresa-id', { estado: 'draft' });

      expect(result).toEqual({
        cantidad: 0,
        montoTotal: 0,
        montoITBIS: 0,
        montoItbisRetenido: 0,
        montoRentaRetenido: 0,
        porEstado: {},
        porTipo: {},
      });
    });
  });

  describe('exportCsv', () => {
    it('genera el header correcto y escapa comas en los valores', async () => {
      const comprobantes = [
        {
          tipoEcf: 'e-CF_31_v_1_0',
          uuid: null,
          rncComprador: '98765432109',
          nombreComprador: 'Cliente, S.A.',
          estado: 'signed',
          montoTotal: '1180.00',
          montoITBIS: '180.00',
          montoItbisRetenido: '0.00',
          montoRentaRetenido: '0.00',
          fechaEmision: new Date('2026-01-01T00:00:00.000Z'),
        },
      ];
      mockEcfRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder(comprobantes));

      const csv = await service.exportCsv('empresa-id');
      const [header, fila] = csv.split('\n');

      expect(header).toBe(
        'Tipo,UUID DGII,RNC Comprador,Nombre Comprador,Estado,Monto Total,ITBIS,ITBIS Retenido,ISR Retenido,Fecha Emisión',
      );
      expect(fila).toContain('"Cliente, S.A."');
      expect(fila).toContain('1180.00');
    });

    it('devuelve solo el header cuando no hay comprobantes', async () => {
      mockEcfRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder([]));

      const csv = await service.exportCsv('empresa-id');

      expect(csv.split('\n')).toHaveLength(1);
    });
  });

  describe('transmitEcf', () => {
    it('rechaza si el comprobante no está firmado', async () => {
      mockEcfRepository.findOne.mockResolvedValue({ id: '1', estado: 'draft' });

      await expect(service.transmitEcf('1', 'empresa-id')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockDgiiService.transmitEcf).not.toHaveBeenCalled();
    });

    it('rechaza si la empresa no tiene tokenDgii', async () => {
      mockEcfRepository.findOne.mockResolvedValue({ id: '1', estado: 'signed' });
      mockEmpresaRepository.findOne.mockResolvedValue({ id: 'empresa-id', tokenDgii: null });

      await expect(service.transmitEcf('1', 'empresa-id')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockDgiiService.transmitEcf).not.toHaveBeenCalled();
    });

    it('transmite y actualiza uuid/código/estado cuando todo es válido', async () => {
      const mockEcf = { id: '1', estado: 'signed', xmlFirmado: '<ECF/>' };
      mockEcfRepository.findOne.mockResolvedValue(mockEcf);
      mockEmpresaRepository.findOne.mockResolvedValue({ id: 'empresa-id', tokenDgii: 'tok-123' });
      mockDgiiService.transmitEcf.mockResolvedValue({
        uuid: 'uuid-abc',
        codigo: '200',
        mensajes: ['Comprobante aceptado'],
      });
      mockEcfRepository.save.mockImplementation((data: any) => Promise.resolve(data));

      const result = await service.transmitEcf('1', 'empresa-id');

      expect(mockDgiiService.transmitEcf).toHaveBeenCalledWith(mockEcf, 'tok-123');
      expect(result).toEqual({
        id: '1',
        estado: 'transmitted',
        uuid: 'uuid-abc',
        codigoSeguridadDgii: '200',
        mensajes: ['Comprobante aceptado'],
      });
    });
  });

  describe('checkStatus', () => {
    it('rechaza si el comprobante no tiene uuid (no transmitido)', async () => {
      mockEcfRepository.findOne.mockResolvedValue({ id: '1', estado: 'signed', uuid: null });

      await expect(service.checkStatus('1', 'empresa-id')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockDgiiService.queryEcfStatus).not.toHaveBeenCalled();
    });

    it('rechaza si la empresa no tiene tokenDgii', async () => {
      mockEcfRepository.findOne.mockResolvedValue({ id: '1', estado: 'transmitted', uuid: 'uuid-abc' });
      mockEmpresaRepository.findOne.mockResolvedValue({ id: 'empresa-id', tokenDgii: null });

      await expect(service.checkStatus('1', 'empresa-id')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('actualiza el estado local a accepted cuando la DGII responde Aceptado', async () => {
      const mockEcf = { id: '1', estado: 'transmitted', uuid: 'uuid-abc' };
      mockEcfRepository.findOne.mockResolvedValue(mockEcf);
      mockEmpresaRepository.findOne.mockResolvedValue({ id: 'empresa-id', tokenDgii: 'tok-123' });
      mockDgiiService.queryEcfStatus.mockResolvedValue({
        uuid: 'uuid-abc',
        estado: 'Aceptado',
        codigo: '200',
        mensaje: 'Comprobante aceptado',
      });
      mockEcfRepository.save.mockImplementation((data: any) => Promise.resolve(data));

      const result = await service.checkStatus('1', 'empresa-id');

      expect(mockDgiiService.queryEcfStatus).toHaveBeenCalledWith('uuid-abc', 'tok-123');
      expect(result.estado).toBe('accepted');
      expect(result.estadoDgii).toBe('Aceptado');
    });

    it('no cambia el estado local si la DGII devuelve un estado no reconocido', async () => {
      const mockEcf = { id: '1', estado: 'transmitted', uuid: 'uuid-abc' };
      mockEcfRepository.findOne.mockResolvedValue(mockEcf);
      mockEmpresaRepository.findOne.mockResolvedValue({ id: 'empresa-id', tokenDgii: 'tok-123' });
      mockDgiiService.queryEcfStatus.mockResolvedValue({
        uuid: 'uuid-abc',
        estado: 'EnProceso',
        codigo: '102',
        mensaje: 'En proceso de validación',
      });

      const result = await service.checkStatus('1', 'empresa-id');

      expect(result.estado).toBe('transmitted');
      expect(mockEcfRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('cancelEcf', () => {
    it('rechaza si el comprobante no tiene uuid', async () => {
      mockEcfRepository.findOne.mockResolvedValue({ id: '1', estado: 'signed', uuid: null });

      await expect(
        service.cancelEcf('1', 'empresa-id', 'motivo'),
      ).rejects.toThrow(BadRequestException);
      expect(mockDgiiService.cancelEcf).not.toHaveBeenCalled();
    });

    it('rechaza si ya está cancelado', async () => {
      mockEcfRepository.findOne.mockResolvedValue({
        id: '1',
        estado: 'cancelled',
        uuid: 'uuid-abc',
      });

      await expect(
        service.cancelEcf('1', 'empresa-id', 'motivo'),
      ).rejects.toThrow(BadRequestException);
    });

    it('cancela y actualiza el estado cuando todo es válido', async () => {
      const mockEcf = {
        id: '1',
        estado: 'transmitted',
        uuid: 'uuid-abc',
        rncEmisor: '101000001',
        tipoEcf: 'e-CF_31_v_1_0',
        encf: 'E310000000007',
      };
      mockEcfRepository.findOne.mockResolvedValue(mockEcf);
      mockEmpresaRepository.findOne.mockResolvedValue({ id: 'empresa-id', tokenDgii: 'tok-123' });
      mockDgiiService.cancelEcf.mockResolvedValue({
        uuid: 'uuid-abc',
        estado: 'Cancelado',
        codigo: '200',
        mensaje: 'Comprobante cancelado',
      });
      mockEcfRepository.save.mockImplementation((data: any) => Promise.resolve(data));

      const result = await service.cancelEcf('1', 'empresa-id', 'Error en el monto');

      expect(mockDgiiService.cancelEcf).toHaveBeenCalledWith(
        'uuid-abc',
        'Error en el monto',
        'tok-123',
        { rncEmisor: '101000001', tipoEcf: 31, encf: 'E310000000007' },
      );
      expect(result).toEqual({
        id: '1',
        estado: 'cancelled',
        mensaje: 'Comprobante cancelado',
      });
    });

    it('anula sin datos de rango (undefined) si el e-CF no tiene tipoEcf/encf reconocibles', async () => {
      const mockEcf = { id: '1', estado: 'transmitted', uuid: 'uuid-abc', rncEmisor: '101000001' };
      mockEcfRepository.findOne.mockResolvedValue(mockEcf);
      mockEmpresaRepository.findOne.mockResolvedValue({ id: 'empresa-id', tokenDgii: 'tok-123' });
      mockDgiiService.cancelEcf.mockResolvedValue({
        uuid: 'uuid-abc',
        estado: 'Cancelado',
        codigo: '200',
        mensaje: 'Comprobante cancelado',
      });
      mockEcfRepository.save.mockImplementation((data: any) => Promise.resolve(data));

      await service.cancelEcf('1', 'empresa-id', 'Error en el monto');

      expect(mockDgiiService.cancelEcf).toHaveBeenCalledWith(
        'uuid-abc',
        'Error en el monto',
        'tok-123',
        undefined,
      );
    });
  });
});
