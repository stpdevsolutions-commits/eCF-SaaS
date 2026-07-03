import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateEmpresaUserDto {
  @ApiProperty({ example: 'María García' })
  @IsString()
  nombre!: string;

  @ApiProperty({ example: 'maria@empresa.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @MinLength(8)
  password!: string;
}
