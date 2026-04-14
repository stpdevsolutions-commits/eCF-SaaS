import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Ecf } from './ecf.entity';

@Entity('linea_ecf')
export class LineaEcf {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'int' })
  numero!: number;

  @Column({ type: 'varchar', length: 255 })
  descripcion!: string;

  @Column({ type: 'int' })
  cantidad!: number;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  precioUnitario!: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  descuentoLinea!: number;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  subtotal!: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  itbis!: number;

  @ManyToOne(() => Ecf, (ecf) => ecf.lineas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ecf_id' })
  ecf!: Ecf;
}
