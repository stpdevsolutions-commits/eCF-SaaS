import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePerfilDto {
  @ApiProperty({ example: 'Pedro Sánchez' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  nombre!: string;
}
