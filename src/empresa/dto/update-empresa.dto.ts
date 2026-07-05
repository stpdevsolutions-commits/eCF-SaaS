import { IsString, IsOptional, IsNotEmpty, MaxLength, Matches } from 'class-validator';
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

  @ApiPropertyOptional({ description: 'Logo de la empresa, como data URL en base64 (PNG/JPEG/SVG)' })
  @IsOptional()
  @IsString()
  @Matches(/^data:image\/(png|jpe?g|svg\+xml|webp);base64,/, {
    message: 'logoBase64 debe ser una data URL de imagen válida (png/jpeg/svg/webp en base64)',
  })
  @MaxLength(5_000_000)
  logoBase64?: string;
}
