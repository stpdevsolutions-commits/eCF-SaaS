import {
  CreateEcfDto,
  Ecf,
  Empresa,
  EmpresaResponse,
  LoginResponse,
  ResumenReporte,
  SecuenciaEncf,
  SessionUser,
  UpdateEmpresaDto,
  UsuarioEmpresa,
} from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('ecf_token');
}

/** Sesión guardada en el login (incluye `rol` para condicionar la UI). */
export function getStoredUser(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('ecf_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export function saveStoredUser(user: SessionUser): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('ecf_user', JSON.stringify(user));
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ecf_token');
      localStorage.removeItem('ecf_user');
      window.location.href = '/login';
    }
    throw new Error('No autorizado');
  }

  const data = await res.json();

  if (!res.ok) {
    const msg = Array.isArray(data.message)
      ? data.message.join(', ')
      : (data.message ?? `Error ${res.status}`);
    throw new Error(msg);
  }

  return data as T;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return handleResponse<LoginResponse>(res);
}

export async function getMe(): Promise<{
  id: string;
  email: string;
  nombre?: string;
  rol?: string;
  empresaId?: string | null;
}> {
  const res = await fetch(`${API_URL}/api/auth/me`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function changePassword(
  passwordActual: string,
  passwordNueva: string,
): Promise<{ message: string }> {
  const res = await fetch(`${API_URL}/api/auth/password`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ passwordActual, passwordNueva }),
  });
  return handleResponse(res);
}

export async function updatePerfil(
  nombre: string,
): Promise<{ message: string; user: SessionUser }> {
  const res = await fetch(`${API_URL}/api/auth/perfil`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ nombre }),
  });
  return handleResponse(res);
}

// ── Empresa ──────────────────────────────────────────────────────────────────

export async function getEmpresa(): Promise<EmpresaResponse> {
  const res = await fetch(`${API_URL}/api/empresa`, {
    headers: authHeaders(),
  });
  return handleResponse<EmpresaResponse>(res);
}

export async function updateEmpresa(dto: UpdateEmpresaDto): Promise<Empresa> {
  const res = await fetch(`${API_URL}/api/empresa`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(dto),
  });
  return handleResponse<Empresa>(res);
}

export async function getSecuencias(): Promise<SecuenciaEncf[]> {
  const res = await fetch(`${API_URL}/api/empresa/secuencias`, {
    headers: authHeaders(),
  });
  return handleResponse<SecuenciaEncf[]>(res);
}

export async function setSecuencia(
  tipoEcf: string,
  ultimaSecuencia: number,
): Promise<SecuenciaEncf> {
  const res = await fetch(
    `${API_URL}/api/empresa/secuencias/${encodeURIComponent(tipoEcf)}`,
    {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ ultimaSecuencia }),
    },
  );
  return handleResponse<SecuenciaEncf>(res);
}

export async function createUsuarioEmpresa(dto: {
  nombre: string;
  email: string;
  password: string;
}): Promise<UsuarioEmpresa> {
  const res = await fetch(`${API_URL}/api/empresa/usuarios`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(dto),
  });
  return handleResponse<UsuarioEmpresa>(res);
}

export async function deactivateUsuarioEmpresa(
  id: string,
): Promise<{ message: string; usuario: UsuarioEmpresa }> {
  const res = await fetch(`${API_URL}/api/empresa/usuarios/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// ── ECF ──────────────────────────────────────────────────────────────────────

export async function listEcf(filters?: {
  estado?: string;
  rncComprador?: string;
}): Promise<Ecf[]> {
  const params = new URLSearchParams();
  if (filters?.estado) params.set('estado', filters.estado);
  if (filters?.rncComprador) params.set('rncComprador', filters.rncComprador);

  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${API_URL}/api/ecf${qs}`, {
    headers: authHeaders(),
  });
  return handleResponse<Ecf[]>(res);
}

export async function getEcf(id: string): Promise<Ecf> {
  const res = await fetch(`${API_URL}/api/ecf/${id}`, {
    headers: authHeaders(),
  });
  return handleResponse<Ecf>(res);
}

export async function createEcf(dto: CreateEcfDto): Promise<Ecf> {
  const res = await fetch(`${API_URL}/api/ecf`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(dto),
  });
  return handleResponse<Ecf>(res);
}

export async function validateEcf(id: string): Promise<{ estado: string; valid: boolean; errors?: string[] }> {
  const res = await fetch(`${API_URL}/api/ecf/${id}/validate`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function signEcf(id: string): Promise<{ estado: string; mensaje: string }> {
  const res = await fetch(`${API_URL}/api/ecf/${id}/sign`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function transmitEcf(id: string): Promise<{
  estado: string;
  uuid: string;
  codigoSeguridadDgii: string;
  mensajes: string[];
}> {
  const res = await fetch(`${API_URL}/api/ecf/${id}/transmit`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function checkEcfStatus(id: string): Promise<{
  estado: string;
  estadoDgii: string;
  mensaje: string;
}> {
  const res = await fetch(`${API_URL}/api/ecf/${id}/status`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function cancelEcf(
  id: string,
  motivo: string,
): Promise<{ estado: string; mensaje: string }> {
  const res = await fetch(`${API_URL}/api/ecf/${id}/cancel`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ motivo }),
  });
  return handleResponse(res);
}

// ── DGII ─────────────────────────────────────────────────────────────────────

export async function authenticateDgii(
  rncEmisor: string,
  usuario: string,
  clave: string,
): Promise<{ token: string; expiresIn: number }> {
  const res = await fetch(`${API_URL}/api/dgii/authenticate`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ rncEmisor, usuario, clave }),
  });
  return handleResponse(res);
}

// ── Reportes ─────────────────────────────────────────────────────────────────

export interface ReporteFiltros {
  desde?: string;
  hasta?: string;
  estado?: string;
}

function reporteParams(filtros?: ReporteFiltros): string {
  const params = new URLSearchParams();
  if (filtros?.desde) params.set('desde', filtros.desde);
  if (filtros?.hasta) params.set('hasta', filtros.hasta);
  if (filtros?.estado) params.set('estado', filtros.estado);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export async function getResumenReporte(filtros?: ReporteFiltros): Promise<ResumenReporte> {
  const res = await fetch(`${API_URL}/api/ecf/reportes/resumen${reporteParams(filtros)}`, {
    headers: authHeaders(),
  });
  return handleResponse<ResumenReporte>(res);
}

export async function descargarReporteCsv(filtros?: ReporteFiltros): Promise<void> {
  const res = await fetch(`${API_URL}/api/ecf/reportes/export${reporteParams(filtros)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message ?? `Error ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'comprobantes.csv';
  a.click();
  URL.revokeObjectURL(url);
}
