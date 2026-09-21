import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * e-CF recibido de un tercero cuando STP actúa como receptor (comprador).
 *
 * Alimenta el lado receptor del modelo Emisor-Receptor Electrónicos
 * (Informe Técnico e-CF v1.0, sección 8): cuando otro emisor electrónico
 * nos envía un comprobante a la "URL Recepción e-CF" registrada en el
 * Directorio FE, se guarda aquí y se responde con un Acuse de Recibo
 * (ARECF) firmado — ver DgiiReceptorService.
 */
@Entity('ecf_recibidos')
@Index(['rncEmisor'])
@Index(['encf'])
export class EcfRecibido {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 20 })
  rncEmisor!: string;

  /** RNC receptor con el que se firmó el acuse (el nuestro, no necesariamente el del XML entrante). */
  @Column({ type: 'varchar', length: 20 })
  rncComprador!: string;

  @Column({ type: 'varchar', length: 13 })
  encf!: string;

  @Column({ type: 'int', nullable: true })
  tipoEcf?: number;

  @Column({ type: 'timestamp', nullable: true })
  fechaEmision?: Date;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  montoTotal?: number;

  @Column({ type: 'text' })
  xmlRecibido!: string;

  // Estado del Acuse de Recibo (ARECF): 0=e-CF Recibido, 1=e-CF No Recibido.
  @Column({
    type: 'enum',
    enum: ['recibido', 'no_recibido'],
  })
  estadoAcuse!: string;

  /** Código motivo (1-4) cuando estadoAcuse='no_recibido' — ver Formato Acuse de Recibo v1.0. */
  @Column({ type: 'varchar', length: 1, nullable: true })
  codigoMotivoNoRecibido?: string;

  @Column({ type: 'text', nullable: true })
  xmlAcuseFirmado?: string;

  @Column({ type: 'timestamp' })
  fechaHoraAcuse!: Date;

  /** Decisión de STP como comprador sobre este e-CF recibido (no llega automáticamente, se setea aparte). */
  @Column({
    type: 'enum',
    enum: ['pendiente', 'aceptado', 'rechazado'],
    default: 'pendiente',
  })
  aprobacionComercial!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
