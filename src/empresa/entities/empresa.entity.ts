import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Empresa emisora de comprobantes fiscales.
 *
 * Fuente de verdad de los datos fiscales (RNC, razón social, dirección, etc.).
 * Los campos equivalentes en User (numeroRegistro, razonSocial, ...) quedan
 * como legacy para no romper compatibilidad, pero no deben usarse para lógica
 * nueva.
 */
@Entity('empresas')
@Index(['rnc'], { unique: true })
export class Empresa {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  rnc!: string; // RNC o Cédula del emisor

  @Column({ type: 'varchar', length: 255 })
  razonSocial!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  nombreComercial?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  direccion?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  telefono?: string;

  /** Logo de la empresa como data URL en base64 (ej. "data:image/png;base64,..."), mostrado en las facturas. */
  @Column({ type: 'text', nullable: true })
  logoBase64?: string;

  @Column({
    type: 'enum',
    enum: ['regimen_ordinario', 'regimen_simplificado', 'monotributo'],
    default: 'regimen_ordinario',
  })
  tipoContribuyente!: string;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
