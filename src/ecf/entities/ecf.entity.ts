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
import { LineaEcf } from './linea-ecf.entity';

@Entity('ecf')
@Index(['rncEmisor'])
@Index(['rncComprador'])
@Index(['estado'])
@Index(['fechaEmision'])
export class Ecf {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 10 })
  tipoEcf!: string; // e31, e32, e33, e34, e41, e43, e44, e45, e46, e47

  @Column({ type: 'varchar', length: 10, default: 'v1.0' })
  version!: string;

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

  @Column({ type: 'text', nullable: true })
  xmlFirmado?: string;

  @Column({ type: 'text', nullable: true })
  xmlValidacion?: string;

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
