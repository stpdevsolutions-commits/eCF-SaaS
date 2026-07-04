import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  Index,
  JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Empresa } from '../../empresa/entities/empresa.entity';
import { LineaEcf } from './linea-ecf.entity';

@Entity('ecf')
@Index(['empresaId'])
@Index(['rncEmisor'])
@Index(['rncComprador'])
@Index(['estado'])
@Index(['fechaEmision'])
@Index(['encf'])
export class Ecf {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 20 })
  tipoEcf!: string; // e-CF_31_v_1_0 … e-CF_47_v_1_0

  @Column({ type: 'varchar', length: 10, default: 'v1.0' })
  version!: string;

  /**
   * eNCF asignado (E + tipo 2 dígitos + secuencia 10 dígitos, ej. E310000000001).
   * Se asigna UNA sola vez (al generar el XML por primera vez) y se reutiliza
   * en firmas/regeneraciones posteriores.
   */
  @Column({ type: 'varchar', length: 13, nullable: true })
  encf?: string;

  @Column({ type: 'timestamp' })
  fechaEmision!: Date;

  @Column({ type: 'varchar', length: 20 })
  rncEmisor!: string;

  @Column({ type: 'varchar', length: 255 })
  nombreEmisor!: string;

  @Column({ type: 'varchar', length: 20 })
  rncComprador!: string;

  @Column({ type: 'varchar', length: 255 })
  nombreComprador!: string;

  @Column({
    type: 'enum',
    enum: [
      'draft',
      'validated',
      'signed',
      'transmitted',
      'accepted',
      'rejected',
      'cancelled',
    ],
    default: 'draft',
  })
  estado!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  montoTotal!: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  montoDescuento!: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  montoITBIS!: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  montoItbisRetenido!: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  montoRentaRetenido!: number;

  @Column({ type: 'varchar', length: 3, default: 'RD' })
  moneda!: string; // RD, USD

  @Column({ type: 'varchar', nullable: true })
  uuid?: string; // UUID DGII

  @Column({ type: 'varchar', nullable: true })
  codigoSeguridadDgii?: string;

  /** URL de consulta de timbre (QR de la representación impresa), generada al firmar. */
  @Column({ type: 'text', nullable: true })
  qrUrl?: string;

  @Column({ type: 'text', nullable: true })
  xmlFirmado?: string;

  @Column({ type: 'text', nullable: true })
  xmlValidacion?: string;

  /**
   * Empresa emisora: los e-CF se comparten entre todos los usuarios de la
   * misma empresa (scoping de todos los queries).
   */
  @Column({ name: 'empresa_id', type: 'uuid', nullable: true })
  empresaId?: string;

  @ManyToOne(() => Empresa)
  @JoinColumn({ name: 'empresa_id' })
  empresa?: Empresa;

  /** Usuario que creó el comprobante ("creado por"), ya no se usa para scoping. */
  @ManyToOne(() => User, (user) => user.ecfs)
  @JoinColumn({ name: 'usuario_id' })
  usuario!: User;

  @OneToMany(() => LineaEcf, (linea) => linea.ecf, { cascade: true })
  lineas?: LineaEcf[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
