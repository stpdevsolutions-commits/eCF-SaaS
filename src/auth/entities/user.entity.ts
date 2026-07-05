import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Ecf } from '../../ecf/entities/ecf.entity';
import { Empresa } from '../../empresa/entities/empresa.entity';

@Entity('users')
@Index(['email'], { unique: true })
@Index(['numeroRegistro'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  nombre!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ type: 'varchar' })
  password!: string;

  /**
   * LEGACY: el RNC/Cédula del emisor ahora vive en Empresa.rnc.
   * Se conserva (nullable) para compatibilidad; los usuarios "member"
   * creados vía POST /empresa/usuarios no lo tienen.
   */
  @Column({ type: 'varchar', length: 20, unique: true, nullable: true })
  numeroRegistro?: string; // RNC o Cédula (legacy)

  /** Empresa a la que pertenece el usuario. Fuente de verdad fiscal. */
  @Column({ name: 'empresa_id', type: 'uuid', nullable: true })
  empresaId?: string;

  @ManyToOne(() => Empresa)
  @JoinColumn({ name: 'empresa_id' })
  empresa?: Empresa;

  @Column({
    type: 'enum',
    enum: ['admin', 'member'],
    default: 'admin', // default admin para compatibilidad con usuarios pre-existentes
  })
  rol!: string;

  @Column({
    type: 'enum',
    enum: ['fisica', 'juridica'],
    default: 'juridica',
  })
  tipoPersona!: string;

  @Column({
    type: 'enum',
    enum: ['regimen_ordinario', 'regimen_simplificado', 'monotributo'],
    default: 'regimen_ordinario',
  })
  tipoContribuyente!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  razonSocial?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  direccion?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  telefono?: string;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => Ecf, (ecf) => ecf.usuario)
  ecfs?: Ecf[];
}
