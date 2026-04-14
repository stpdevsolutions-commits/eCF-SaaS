import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity("ecf")
export class EcfEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  tipoEcf!: string;

  @Column()
  rncEmisor!: string;

  @Column()
  rncComprador!: string;

  @Column("decimal")
  montoTotal!: number;
}
