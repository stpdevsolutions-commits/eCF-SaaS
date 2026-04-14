import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EcfService } from './ecf.service';
import { Ecf } from '../entities/ecf.entity';
import { LineaEcf } from '../entities/linea-ecf.entity';
import { XsdValidatorService } from '../../validation/xsd-validator.service';

describe('EcfService', () => {
  let service: EcfService;
  let mockEcfRepository: any;
  let mockLineaRepository: any;
  let mockValidatorService: any;

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
        usuario: { id: 'user-id' },
      };

      mockEcfRepository.findOne.mockResolvedValue(mockEcf);
      mockEcfRepository.save.mockResolvedValue(mockEcf);

      const result = await service.validateEcf('1', 'user-id');

      expect(result.valid).toBe(true);
    });
  });
});
