import { IsString, IsOptional, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Actualización parcial de los datos de la empresa.
 * El RNC NO es editable (identidad fiscal del emisor).
 */
export class UpdateEmpresaDto {
  @ApiPropertyOptional({ example: 'Mi Empresa S.R.L.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  razonSocial?: string;

  @ApiPropertyOptional({ example: 'Mi Empresa' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  nombreComercial?: string;

  @ApiPropertyOptional({ example: 'Av. Winston Churchill 1099, Santo Domingo' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  direccion?: string;

  @ApiPropertyOptional({ example: '809-555-0100' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  telefono?: string;
}
