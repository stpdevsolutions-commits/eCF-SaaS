export type EstadoEcf =
  | 'draft'
  | 'validated'
  | 'signed'
  | 'transmitted'
  | 'accepted'
  | 'rejected'
  | 'cancelled';

export interface LineaEcf {
  id: string;
  numero: number;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuentoLinea: number;
  subtotal: number;
  itbis: number;
}

export interface Ecf {
  id: string;
  tipoEcf: string;
  version: string;
  fechaEmision: string;
  rncEmisor: string;
  nombreEmisor: string;
  rncComprador: string;
  nombreComprador: string;
  estado: EstadoEcf;
  montoTotal: number;
  montoDescuento: number;
  montoITBIS: number;
  montoItbisRetenido: number;
  montoRentaRetenido: number;
  moneda: string;
  uuid?: string;
  codigoSeguridadDgii?: string;
  xmlFirmado?: string;
  xmlValidacion?: string;
  lineas?: LineaEcf[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateLineaEcfDto {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuentoLinea?: number;
}

export interface CreateEcfDto {
  tipoEcf: string;
  rncEmisor: string;
  nombreEmisor: string;
  rncComprador: string;
  nombreComprador: string;
  moneda?: string;
  lineas: CreateLineaEcfDto[];
}

export interface LoginResponse {
  access_token: string;
  user?: {
    id: string;
    email: string;
    nombre?: string;
  };
}

export interface ApiError {
  message: string | string[];
  statusCode: number;
}
