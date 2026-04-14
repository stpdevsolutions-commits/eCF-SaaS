import {
  IsString,
  IsNumber,
  IsArray,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateLineaEcfDto {
  @IsString()
  descripcion: string;

  @IsNumber()
  cantidad: number;

  @IsNumber()
  precioUnitario: number;

  @IsNumber()
  @IsOptional()
  descuentoLinea?: number;
}

export class CreateEcfDto {
  @IsString()
  tipoEcf: string;

  @IsString()
  rncEmisor: string;

  @IsString()
  nombreEmisor: string;

  @IsString()
  rncComprador: string;

  @IsString()
  nombreComprador: string;

  @IsString()
  @IsOptional()
  moneda?: string = 'RD';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateLineaEcfDto)
  lineas: CreateLineaEcfDto[];
}
