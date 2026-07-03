import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { NcfSequenceService } from './ncf-sequence.service';
import { NcfSequence } from '../entities/ncf-sequence.entity';

describe('NcfSequenceService', () => {
  let service: NcfSequenceService;
  let mockRepository: any;

  beforeEach(async () => {
    mockRepository = {
      query: jest.fn(),
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NcfSequenceService,
        { provide: getRepositoryToken(NcfSequence), useValue: mockRepository },
      ],
    }).compile();

    service = module.get<NcfSequenceService>(NcfSequenceService);
  });

  describe('listSequences', () => {
    it('devuelve los 10 tipos con secuencia 0 y próximo ...0000000001 si no hay filas', async () => {
      mockRepository.find.mockResolvedValue([]);

      const result = await service.listSequences('empresa-1');

      expect(result).toHaveLength(10);
      const tipo31 = result.find((s) => s.tipoEcf === 'e-CF_31_v_1_0');
      expect(tipo31).toEqual({
        tipoEcf: 'e-CF_31_v_1_0',
        ultimaSecuencia: 0,
        proximoEncf: 'E310000000001',
      });
    });

    it('refleja la última secuencia de las filas existentes', async () => {
      mockRepository.find.mockResolvedValue([
        { empresaId: 'empresa-1', tipoEcf: 'e-CF_32_v_1_0', ultimaSecuencia: '41' },
      ]);

      const result = await service.listSequences('empresa-1');

      const tipo32 = result.find((s) => s.tipoEcf === 'e-CF_32_v_1_0');
      expect(tipo32).toEqual({
        tipoEcf: 'e-CF_32_v_1_0',
        ultimaSecuencia: 41,
        proximoEncf: 'E320000000042',
      });
      // Los tipos sin fila siguen en 0
      const tipo47 = result.find((s) => s.tipoEcf === 'e-CF_47_v_1_0');
      expect(tipo47?.ultimaSecuencia).toBe(0);
    });
  });

  describe('setSequence', () => {
    it('fija la secuencia con un upsert condicional y devuelve el próximo eNCF', async () => {
      mockRepository.query.mockResolvedValue([{ ultima_secuencia: '500' }]);

      const result = await service.setSequence('empresa-1', 'e-CF_31_v_1_0', 500);

      expect(mockRepository.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (empresa_id, tipo_ecf)'),
        ['empresa-1', 'e-CF_31_v_1_0', 500],
      );
      // La condición anti-reducción vive en el propio UPDATE (atómico)
      expect(mockRepository.query.mock.calls[0][0]).toContain(
        'WHERE ncf_sequence.ultima_secuencia <= EXCLUDED.ultima_secuencia',
      );
      expect(result).toEqual({
        tipoEcf: 'e-CF_31_v_1_0',
        ultimaSecuencia: 500,
        proximoEncf: 'E310000000501',
      });
    });

    it('rechaza con 400 si la secuencia nueva es menor que la actual (no matchea el upsert)', async () => {
      // El WHERE del upsert no matchea → RETURNING vacío
      mockRepository.query.mockResolvedValue([]);

      await expect(
        service.setSequence('empresa-1', 'e-CF_31_v_1_0', 10),
      ).rejects.toThrow(
        new BadRequestException(
          'La secuencia no puede reducirse: se re-emitirían eNCF ya utilizados',
        ),
      );
    });

    it('rechaza tipos de e-CF no soportados', async () => {
      await expect(
        service.setSequence('empresa-1', 'e-CF_99_v_1_0', 5),
      ).rejects.toThrow(BadRequestException);
      expect(mockRepository.query).not.toHaveBeenCalled();
    });

    it('rechaza valores fuera de rango (0–9999999999) o no enteros', async () => {
      await expect(
        service.setSequence('empresa-1', 'e-CF_31_v_1_0', -1),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.setSequence('empresa-1', 'e-CF_31_v_1_0', 10_000_000_000),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.setSequence('empresa-1', 'e-CF_31_v_1_0', 3.5),
      ).rejects.toThrow(BadRequestException);
      expect(mockRepository.query).not.toHaveBeenCalled();
    });

    it('acepta 0 (deja el contador como recién creado)', async () => {
      mockRepository.query.mockResolvedValue([{ ultima_secuencia: '0' }]);

      const result = await service.setSequence('empresa-1', 'e-CF_44_v_1_0', 0);

      expect(result.proximoEncf).toBe('E440000000001');
    });
  });

  describe('nextSequence', () => {
    it('incrementa de forma atómica y devuelve el número asignado', async () => {
      mockRepository.query.mockResolvedValue([{ ultima_secuencia: '7' }]);

      const seq = await service.nextSequence('empresa-1', 'e-CF_31_v_1_0');

      expect(seq).toBe(7);
      expect(mockRepository.query).toHaveBeenCalledWith(
        expect.stringContaining('DO UPDATE SET ultima_secuencia = ncf_sequence.ultima_secuencia + 1'),
        ['empresa-1', 'e-CF_31_v_1_0'],
      );
    });
  });
});
