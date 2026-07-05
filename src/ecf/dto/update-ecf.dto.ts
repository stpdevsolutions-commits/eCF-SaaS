import {
  IsString,
  IsArray,
  IsOptional,
  IsIn,
  IsBoolean,
  IsDateString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CreateLineaEcfDto } from './create-ecf.dto';

export class UpdateEcfDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  tipoEcf?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  fechaEmision?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsIn([1, 2, 3])
  tipoPago?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  tipoIngresos?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  terminoPago?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  rncComprador?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  idExtranjeroComprador?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  nombreComprador?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  telefonoComprador?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  correoComprador?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  direccionComprador?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  provinciaComprador?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  municipioComprador?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  comentarioComprador?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  moneda?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  aplicaPropinaLegal?: boolean;

  @ApiProperty({ required: false, type: [CreateLineaEcfDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateLineaEcfDto)
  lineas?: CreateLineaEcfDto[];
}
