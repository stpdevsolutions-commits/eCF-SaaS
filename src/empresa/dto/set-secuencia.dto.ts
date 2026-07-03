import { IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetSecuenciaDto {
  @ApiProperty({
    example: 125,
    description:
      'Última secuencia utilizada. El próximo eNCF emitido será secuencia + 1. ' +
      'No puede ser menor que la secuencia actual (re-emitiría eNCF duplicados).',
    minimum: 0,
    maximum: 9_999_999_999,
  })
  @IsInt()
  @Min(0)
  @Max(9_999_999_999)
  ultimaSecuencia!: number;
}
