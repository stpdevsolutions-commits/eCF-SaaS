import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NcfSequence } from '../entities/ncf-sequence.entity';
import { TIPO_ECF_MAP } from './ecf-xml.service';

const MAX_SECUENCIA = 9_999_999_999;

export interface SecuenciaInfo {
  tipoEcf: string;
  ultimaSecuencia: number;
  proximoEncf: string;
}

@Injectable()
export class NcfSequenceService {
  constructor(
    @InjectRepository(NcfSequence)
    private readonly sequenceRepository: Repository<NcfSequence>,
  ) {}

  /**
   * Asigna la próxima secuencia eNCF para (empresa, tipo de e-CF) de forma
   * atómica y segura ante concurrencia.
   *
   * Usa un upsert nativo de Postgres: dos requests simultáneos serializan en
   * el lock de fila del ON CONFLICT, por lo que nunca se entrega la misma
   * secuencia dos veces.
   */
  async nextSequence(empresaId: string, tipoEcf: string): Promise<number> {
    const rows: Array<{ ultima_secuencia: string }> =
      await this.sequenceRepository.query(
        `INSERT INTO ncf_sequence (empresa_id, tipo_ecf, ultima_secuencia)
         VALUES ($1, $2, 1)
         ON CONFLICT (empresa_id, tipo_ecf)
         DO UPDATE SET ultima_secuencia = ncf_sequence.ultima_secuencia + 1
         RETURNING ultima_secuencia`,
        [empresaId, tipoEcf],
      );

    return Number(rows[0].ultima_secuencia);
  }

  /**
   * Lista los 10 tipos de e-CF con su última secuencia asignada y el próximo
   * eNCF que se emitiría. Los tipos sin fila en la tabla se reportan con
   * secuencia 0 (próximo = ...0000000001).
   */
  async listSequences(empresaId: string): Promise<SecuenciaInfo[]> {
    const rows = await this.sequenceRepository.find({ where: { empresaId } });
    const byTipo = new Map(rows.map((r) => [r.tipoEcf, Number(r.ultimaSecuencia)]));

    return Object.entries(TIPO_ECF_MAP).map(([tipoEcf, tipoNumerico]) => {
      const ultimaSecuencia = byTipo.get(tipoEcf) ?? 0;
      return {
        tipoEcf,
        ultimaSecuencia,
        proximoEncf: this.formatENCF(tipoNumerico, ultimaSecuencia + 1),
      };
    });
  }

  /**
   * Fija el contador de secuencia para (empresa, tipo). Útil para arrancar
   * desde la secuencia autorizada por la DGII.
   *
   * VALIDACIÓN CRÍTICA: el valor nuevo debe ser >= al actual — bajarlo haría
   * que se re-emitieran eNCF ya usados (duplicados ante la DGII). La condición
   * se aplica dentro del propio UPDATE (atómico frente a nextSequence
   * concurrentes).
   */
  async setSequence(
    empresaId: string,
    tipoEcf: string,
    ultimaSecuencia: number,
  ): Promise<SecuenciaInfo> {
    const tipoNumerico = TIPO_ECF_MAP[tipoEcf];
    if (!tipoNumerico) {
      throw new BadRequestException(
        `Tipo de e-CF no soportado: "${tipoEcf}". Valores válidos: ${Object.keys(TIPO_ECF_MAP).join(', ')}`,
      );
    }

    if (
      !Number.isInteger(ultimaSecuencia) ||
      ultimaSecuencia < 0 ||
      ultimaSecuencia > MAX_SECUENCIA
    ) {
      throw new BadRequestException(
        `La secuencia debe ser un entero entre 0 y ${MAX_SECUENCIA}`,
      );
    }

    // Upsert condicional: solo actualiza si el nuevo valor no es menor que el actual.
    const rows: Array<{ ultima_secuencia: string }> =
      await this.sequenceRepository.query(
        `INSERT INTO ncf_sequence (empresa_id, tipo_ecf, ultima_secuencia)
         VALUES ($1, $2, $3)
         ON CONFLICT (empresa_id, tipo_ecf)
         DO UPDATE SET ultima_secuencia = EXCLUDED.ultima_secuencia
         WHERE ncf_sequence.ultima_secuencia <= EXCLUDED.ultima_secuencia
         RETURNING ultima_secuencia`,
        [empresaId, tipoEcf, ultimaSecuencia],
      );

    if (rows.length === 0) {
      // El WHERE del upsert no matcheó: el valor actual es mayor que el nuevo.
      throw new BadRequestException(
        'La secuencia no puede reducirse: se re-emitirían eNCF ya utilizados',
      );
    }

    const nuevaSecuencia = Number(rows[0].ultima_secuencia);
    return {
      tipoEcf,
      ultimaSecuencia: nuevaSecuencia,
      proximoEncf: this.formatENCF(tipoNumerico, nuevaSecuencia + 1),
    };
  }

  /** eNCF de 13 caracteres: E + tipo(2 dígitos) + secuencia(10 dígitos). */
  private formatENCF(tipo: number, seq: number): string {
    return `E${tipo}${String(seq).padStart(10, '0')}`;
  }
}
