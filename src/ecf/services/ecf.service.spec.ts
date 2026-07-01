import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EcfService } from './ecf.service';
import { Ecf } from '../entities/ecf.entity';
import { LineaEcf } from '../entities/linea-ecf.entity';
import { XsdValidatorService } from '../../validation/xsd-validator.service';
import { EcfXmlService } from './ecf-xml.service';
import { EcfSigningService } from './ecf-signing.service';

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
  let mockValidatorService: any;
  let mockXmlService: any;
  let mockSigningService: any;

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
    };

    mockSigningService = {
      signXml: jest.fn().mockReturnValue('<ECF><ds:Signature/></ECF>'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EcfService,
        {
          provide: getRepositoryToken(Ecf),
          useValue: mockEcfRepository,
        },
        {
          provide: getRepositoryToken(LineaEcf),
          useValue: mockLineaRepository,
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

      const result = await service.create(createDto as any, 'user-id');

      expect(result).toBeDefined();
      expect(mockValidatorService.validateEcf).toHaveBeenCalled();
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
        usuario: { id: 'user-id' },
      };

      mockEcfRepository.findOne.mockResolvedValue(mockEcf);
      mockEcfRepository.save.mockResolvedValue(mockEcf);

      const result = await service.validateEcf('1', 'user-id');

      expect(result.valid).toBe(true);
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
        service.create({ lineas: [] } as any, 'user-id'),
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

      await service.create(createDto as any, 'user-id');

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

      await service.create(createDto as any, 'user-id');

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

      const result = await service.getResumen('user-id');

      expect(result.cantidad).toBe(2);
      expect(result.montoTotal).toBe(7080);
      expect(result.montoITBIS).toBe(1080);
      expect(result.montoRentaRetenido).toBe(500);
      expect(result.porEstado).toEqual({ signed: 1, draft: 1 });
      expect(result.porTipo).toEqual({ 'e-CF_31_v_1_0': 1, 'e-CF_41_v_1_0': 1 });
    });

    it('devuelve ceros y objetos vacíos cuando no hay comprobantes', async () => {
      mockEcfRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder([]));

      const result = await service.getResumen('user-id', { estado: 'draft' });

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

      const csv = await service.exportCsv('user-id');
      const [header, fila] = csv.split('\n');

      expect(header).toBe(
        'Tipo,UUID DGII,RNC Comprador,Nombre Comprador,Estado,Monto Total,ITBIS,ITBIS Retenido,ISR Retenido,Fecha Emisión',
      );
      expect(fila).toContain('"Cliente, S.A."');
      expect(fila).toContain('1180.00');
    });

    it('devuelve solo el header cuando no hay comprobantes', async () => {
      mockEcfRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder([]));

      const csv = await service.exportCsv('user-id');

      expect(csv.split('\n')).toHaveLength(1);
    });
  });
});
