import { Entity, PrimaryColumn, Column } from 'typeorm';

/**
 * Contador de secuencias eNCF por (empresa, tipo de e-CF).
 *
 * La secuencia eNCF es por emisor (empresa), no por usuario: todos los
 * usuarios de la misma empresa comparten el mismo contador.
 *
 * La clave primaria compuesta (empresa_id, tipo_ecf) garantiza a nivel de BD
 * que existe una sola fila por combinación, lo que permite incrementar el
 * contador de forma atómica con:
 *
 *   INSERT ... ON CONFLICT (empresa_id, tipo_ecf)
 *   DO UPDATE SET ultima_secuencia = ncf_sequence.ultima_secuencia + 1
 *   RETURNING ultima_secuencia
 */
@Entity('ncf_sequence')
export class NcfSequence {
  @PrimaryColumn({ name: 'empresa_id', type: 'uuid' })
  empresaId!: string;

  @PrimaryColumn({ name: 'tipo_ecf', type: 'varchar', length: 20 })
  tipoEcf!: string; // e-CF_31_v_1_0 … e-CF_47_v_1_0

  // bigint: el driver de Postgres lo devuelve como string
  @Column({ name: 'ultima_secuencia', type: 'bigint', default: 0 })
  ultimaSecuencia!: string;
}
