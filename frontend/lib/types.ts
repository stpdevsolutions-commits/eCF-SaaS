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
  indicadorAgenteRetencionoPercepcion?: number;
  montoItbisRetenido?: number;
  montoIsrRetenido?: number;
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
  indicadorAgenteRetencionoPercepcion?: number;
  montoItbisRetenido?: number;
  montoIsrRetenido?: number;
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

export type UserRol = 'admin' | 'member';

export interface SessionUser {
  id: string;
  email: string;
  nombre?: string;
  numeroRegistro?: string;
  rol?: string;
  empresaId?: string | null;
}

export interface LoginResponse {
  access_token: string;
  user?: SessionUser;
  empresa?: {
    id: string;
    rnc: string;
    razonSocial: string;
  } | null;
}

export interface Empresa {
  id: string;
  rnc: string;
  razonSocial: string;
  nombreComercial?: string | null;
  direccion?: string | null;
  telefono?: string | null;
  tipoContribuyente: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UsuarioEmpresa {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  activo: boolean;
  createdAt: string;
}

export interface EmpresaResponse {
  empresa: Empresa;
  usuarios: UsuarioEmpresa[];
}

export interface UpdateEmpresaDto {
  razonSocial?: string;
  nombreComercial?: string;
  direccion?: string;
  telefono?: string;
}

export interface SecuenciaEncf {
  tipoEcf: string;
  ultimaSecuencia: number;
  proximoEncf: string;
}

export interface ApiError {
  message: string | string[];
  statusCode: number;
}

export interface ResumenReporte {
  cantidad: number;
  montoTotal: number;
  montoITBIS: number;
  montoItbisRetenido: number;
  montoRentaRetenido: number;
  porEstado: Record<string, number>;
  porTipo: Record<string, number>;
}
