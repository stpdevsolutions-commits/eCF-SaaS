import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NcfSequence } from '../entities/ncf-sequence.entity';

@Injectable()
export class NcfSequenceService {
  constructor(
    @InjectRepository(NcfSequence)
    private readonly sequenceRepository: Repository<NcfSequence>,
  ) {}

  /**
   * Asigna la próxima secuencia eNCF para (usuario, tipo de e-CF) de forma
   * atómica y segura ante concurrencia.
   *
   * Usa un upsert nativo de Postgres: dos requests simultáneos serializan en
   * el lock de fila del ON CONFLICT, por lo que nunca se entrega la misma
   * secuencia dos veces.
   */
  async nextSequence(usuarioId: string, tipoEcf: string): Promise<number> {
    const rows: Array<{ ultima_secuencia: string }> =
      await this.sequenceRepository.query(
        `INSERT INTO ncf_sequence (usuario_id, tipo_ecf, ultima_secuencia)
         VALUES ($1, $2, 1)
         ON CONFLICT (usuario_id, tipo_ecf)
         DO UPDATE SET ultima_secuencia = ncf_sequence.ultima_secuencia + 1
         RETURNING ultima_secuencia`,
        [usuarioId, tipoEcf],
      );

    return Number(rows[0].ultima_secuencia);
  }
}
