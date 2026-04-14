import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateEcfDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  nombreComprador?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  rncComprador?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  moneda?: string;
}
