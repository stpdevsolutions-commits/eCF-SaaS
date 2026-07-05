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

  // IndicadorBienoServicio: 1 = Bien, 2 = Servicio (XSD IndicadorBienoServicioType)
  @Column({ type: 'int', default: 1 })
  indicadorBienoServicio!: number;

  // UnidadMedida: código 1-54 (XSD UnidadMedidaType), ej. 43 = Unidad
  @Column({ type: 'int', nullable: true })
  unidadMedida?: number;

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

  // Retención (e-CF 31/33/34: opcional; e-CF 41: requerido) — 1 = Retención, 2 = Percepción
  @Column({ type: 'int', nullable: true })
  indicadorAgenteRetencionoPercepcion?: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  montoItbisRetenido?: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  montoIsrRetenido?: number;

  @ManyToOne(() => Ecf, (ecf) => ecf.lineas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ecf_id' })
  ecf!: Ecf;
}
