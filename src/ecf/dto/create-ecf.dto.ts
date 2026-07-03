import {
  IsString,
  IsNumber,
  IsArray,
  IsOptional,
  IsIn,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateLineaEcfDto {
  @IsString()
  descripcion!: string;

  @IsNumber()
  cantidad!: number;

  @IsNumber()
  precioUnitario!: number;

  @IsNumber()
  @IsOptional()
  descuentoLinea?: number;

  // Retención: 1 = Retención, 2 = Percepción (requerido por el XSD cuando tipoEcf es e-CF_41)
  @IsIn([1, 2])
  @IsOptional()
  indicadorAgenteRetencionoPercepcion?: number;

  @IsNumber()
  @IsOptional()
  montoItbisRetenido?: number;

  @IsNumber()
  @IsOptional()
  montoIsrRetenido?: number;
}

export class CreateEcfDto {
  @IsString()
  tipoEcf!: string;

  @IsString()
  rncEmisor!: string;

  @IsString()
  nombreEmisor!: string;

  @IsString()
  rncComprador!: string;

  @IsString()
  nombreComprador!: string;

  @IsString()
  @IsOptional()
  moneda?: string = 'RD';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateLineaEcfDto)
  lineas!: CreateLineaEcfDto[];
}