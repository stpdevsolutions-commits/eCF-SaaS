import { CreateEcfDto, Ecf, LoginResponse } from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('ecf_token');
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

export async function getMe(): Promise<{ id: string; email: string; nombre?: string }> {
  const res = await fetch(`${API_URL}/api/auth/me`, {
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
