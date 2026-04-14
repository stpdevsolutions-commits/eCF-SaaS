import {
  IsString,
  IsArray,
  IsEnum,
  IsOptional,
  ValidateNested,
  Type,
  IsNumber,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateLineaEcfDto {
  @ApiProperty({ example: 'Servicio de consultoría' })
  @IsString()
  descripcion!: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
  @Min(0.01)
  cantidad!: number;

  @ApiProperty({ example: 1000.00 })
  @IsNumber()
  @Min(0.01)
  precioUnitario!: number;

  @ApiProperty({ example: 0, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  descuentoLinea?: number;
}

export class CreateEcfDto {
  @ApiProperty({ example: 'e-CF_31_v_1_0' })
  @IsEnum([
    'e-CF_31_v_1_0',
    'e-CF_32_v_1_0',
    'e-CF_33_v_1_0',
    'e-CF_34_v_1_0',
    'e-CF_41_v_1_0',
    'e-CF_43_v_1_0',
    'e-CF_44_v_1_0',
    'e-CF_45_v_1_0',
    'e-CF_46_v_1_0',
    'e-CF_47_v_1_0',
  ])
  tipoEcf!: string;

  @ApiProperty({ example: 'v1.0', required: false })
  @IsOptional()
  @IsString()
  version?: string;

  @ApiProperty({ example: '12345678901' })
  @IsString()
  rncEmisor!: string;

  @ApiProperty({ example: 'Mi Empresa S.A.' })
  @IsString()
  nombreEmisor!: string;

  @ApiProperty({ example: '98765432109' })
  @IsString()
  rncComprador!: string;

  @ApiProperty({ example: 'Cliente Empresa S.A.' })
  @IsString()
  nombreComprador!: string;

  @ApiProperty({ example: 'RD', required: false })
  @IsOptional()
  @IsEnum(['RD', 'USD', 'EUR'])
  moneda?: string;

  @ApiProperty({ type: [CreateLineaEcfDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateLineaEcfDto)
  lineas!: CreateLineaEcfDto[];
}
