import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Ecf } from '../../ecf/entities/ecf.entity';

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

  @Column({ type: 'varchar', length: 20, unique: true })
  numeroRegistro!: string; // RNC o Cédula

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

  @Column({ type: 'boolean', default: false })
  certificadoDgii!: boolean;

  @Column({ type: 'varchar', nullable: true })
  tokenDgii?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => Ecf, (ecf) => ecf.usuario)
  ecfs?: Ecf[];
}
