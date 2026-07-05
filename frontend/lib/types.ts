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
  indicadorBienoServicio: number; // 1 = Bien, 2 = Servicio
  unidadMedida?: number;
  indicadorFacturacion: number; // 1=ITBIS 18%, 2=ITBIS 16%, 3=ITBIS 0%, 4=Exento
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
  encf?: string;
  fechaEmision: string;
  rncEmisor: string;
  nombreEmisor: string;
  direccionEmisor?: string;
  tipoPago: number;
  tipoIngresos: string;
  terminoPago?: string;
  rncComprador: string;
  idExtranjeroComprador?: string;
  nombreComprador: string;
  telefonoComprador?: string;
  correoComprador?: string;
  direccionComprador?: string;
  provinciaComprador?: string;
  municipioComprador?: string;
  comentarioComprador?: string;
  estado: EstadoEcf;
  montoTotal: number;
  montoDescuento: number;
  montoITBIS: number;
  montoItbisRetenido: number;
  montoRentaRetenido: number;
  aplicaPropinaLegal: boolean;
  montoPropinaLegal: number;
  moneda: string;
  uuid?: string;
  codigoSeguridadDgii?: string;
  qrUrl?: string;
  xmlFirmado?: string;
  xmlValidacion?: string;
  lineas?: LineaEcf[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateLineaEcfDto {
  descripcion: string;
  indicadorBienoServicio?: number;
  unidadMedida?: number;
  indicadorFacturacion?: number;
  cantidad: number;
  precioUnitario: number;
  descuentoLinea?: number;
  indicadorAgenteRetencionoPercepcion?: number;
  montoItbisRetenido?: number;
  montoIsrRetenido?: number;
}

export interface CreateEcfDto {
  tipoEcf: string;
  fechaEmision?: string;
  tipoPago?: number;
  tipoIngresos?: string;
  terminoPago?: string;
  rncComprador: string;
  idExtranjeroComprador?: string;
  nombreComprador: string;
  telefonoComprador?: string;
  correoComprador?: string;
  direccionComprador?: string;
  provinciaComprador?: string;
  municipioComprador?: string;
  comentarioComprador?: string;
  moneda?: string;
  aplicaPropinaLegal?: boolean;
  lineas: CreateLineaEcfDto[];
}

export type UpdateEcfDto = Partial<CreateEcfDto>;

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
  logoBase64?: string | null;
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
  logoBase64?: string;
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
