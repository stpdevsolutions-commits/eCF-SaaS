import {
  IsString,
  IsNumber,
  IsArray,
  IsOptional,
  IsIn,
  IsBoolean,
  IsDateString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateLineaEcfDto {
  @IsString()
  descripcion!: string;

  // IndicadorBienoServicio: 1 = Bien, 2 = Servicio
  @IsIn([1, 2])
  @IsOptional()
  indicadorBienoServicio?: number = 1;

  // UnidadMedida: código 1-54 del XSD (ej. 43 = Unidad)
  @IsNumber()
  @IsOptional()
  unidadMedida?: number;

  // IndicadorFacturacion: 1=ITBIS 18%, 2=ITBIS 16%, 3=ITBIS 0%, 4=Exento
  @IsIn([1, 2, 3, 4])
  @IsOptional()
  indicadorFacturacion?: number = 1;

  @IsNumber()
  cantidad!: number;

  @IsNumber()
  precioUnitario!: number;

  @IsNumber()
  @IsOptional()
  descuentoLinea?: number;

  // Retención: 1 = Retención, 2 = Percepción (requerido por el XSD cuando tipoEcf es e-CF_41)
  @IsIn([1, 2])
  @IsOptional()
  indicadorAgenteRetencionoPercepcion?: number;

  @IsNumber()
  @IsOptional()
  montoItbisRetenido?: number;

  @IsNumber()
  @IsOptional()
  montoIsrRetenido?: number;
}

export class CreateEcfDto {
  @IsString()
  tipoEcf!: string;

  @IsDateString()
  @IsOptional()
  fechaEmision?: string;

  // TipoPago: 1 = Contado, 2 = Crédito, 3 = Gratuito
  @IsIn([1, 2, 3])
  @IsOptional()
  tipoPago?: number = 1;

  // TipoIngresos: 01-06 (XSD TipoIngresosValidationType)
  @IsString()
  @IsOptional()
  tipoIngresos?: string = '01';

  @IsString()
  @IsOptional()
  terminoPago?: string;

  @IsString()
  rncComprador!: string;

  @IsString()
  @IsOptional()
  idExtranjeroComprador?: string;

  @IsString()
  nombreComprador!: string;

  @IsString()
  @IsOptional()
  telefonoComprador?: string;

  @IsString()
  @IsOptional()
  correoComprador?: string;

  @IsString()
  @IsOptional()
  direccionComprador?: string;

  @IsString()
  @IsOptional()
  provinciaComprador?: string;

  @IsString()
  @IsOptional()
  municipioComprador?: string;

  @IsString()
  @IsOptional()
  comentarioComprador?: string;

  @IsString()
  @IsOptional()
  moneda?: string = 'RD';

  // Propina Legal (10%, impuesto adicional código 001) aplicada a todo el comprobante
  @IsBoolean()
  @IsOptional()
  aplicaPropinaLegal?: boolean = false;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateLineaEcfDto)
  lineas!: CreateLineaEcfDto[];
}
