import { IsEmail, IsString, MinLength, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'Juan Pérez' })
  @IsString()
  nombre!: string;

  @ApiProperty({ example: 'juan@test.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: '12345678901' })
  @IsString()
  numeroRegistro!: string;

  @ApiProperty({ example: 'juridica', enum: ['fisica', 'juridica'] })
  @IsEnum(['fisica', 'juridica'])
  tipoPersona!: string;

  @ApiProperty({ example: 'regimen_ordinario' })
  @IsOptional()
  @IsEnum(['regimen_ordinario', 'regimen_simplificado', 'monotributo'])
  tipoContribuyente?: string;

  @ApiProperty({ example: 'Mi Empresa S.A.' })
  @IsOptional()
  @IsString()
  razonSocial?: string;

  @ApiProperty({ example: 'Calle Principal 123' })
  @IsOptional()
  @IsString()
  direccion?: string;

  @ApiProperty({ example: '+1-809-555-1234' })
  @IsOptional()
  @IsString()
  telefono?: string;
}
