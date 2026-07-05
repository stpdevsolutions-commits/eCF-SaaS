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

  /** Copia de Empresa.direccion al momento de crear el e-CF (snapshot, igual que rncEmisor/nombreEmisor). */
  @Column({ type: 'varchar', length: 100, nullable: true })
  direccionEmisor?: string;

  // TipoPago: 1=Contado, 2=Crédito, 3=Gratuito (XSD TipoPagoType)
  @Column({ type: 'int', default: 1 })
  tipoPago!: number;

  // TipoIngresos: 01-06 (XSD TipoIngresosValidationType)
  @Column({ type: 'varchar', length: 2, default: '01' })
  tipoIngresos!: string;

  @Column({ type: 'varchar', length: 15, nullable: true })
  terminoPago?: string;

  @Column({ type: 'varchar', length: 20 })
  rncComprador!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  idExtranjeroComprador?: string;

  @Column({ type: 'varchar', length: 255 })
  nombreComprador!: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  telefonoComprador?: string;

  @Column({ type: 'varchar', length: 320, nullable: true })
  correoComprador?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  direccionComprador?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  provinciaComprador?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  municipioComprador?: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  comentarioComprador?: string;

  // Propina Legal (10%, impuesto adicional código 001) a nivel de todo el comprobante
  @Column({ type: 'boolean', default: false })
  aplicaPropinaLegal!: boolean;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  montoPropinaLegal!: number;

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
