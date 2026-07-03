import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ example: 'MiClaveActual123!' })
  @IsString()
  passwordActual!: string;

  @ApiProperty({ example: 'MiClaveNueva123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  passwordNueva!: string;
}
