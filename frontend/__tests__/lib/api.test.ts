/**
 * Tests del cliente HTTP (lib/api.ts): headers de auth, manejo de 401,
 * construcción de URLs/query strings y mapeo de errores del backend.
 */
import {
  login,
  listEcf,
  getEcf,
  createEcf,
  cancelEcf,
  getResumenReporte,
  changePassword,
  updatePerfil,
  getEmpresa,
  updateEmpresa,
  getSecuencias,
  setSecuencia,
  createUsuarioEmpresa,
  deactivateUsuarioEmpresa,
  getStoredUser,
} from '@/lib/api';

const API_URL = 'http://localhost:3000';

function mockFetchOnce(body: unknown, status = 200) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

beforeEach(() => {
  global.fetch = jest.fn();
  localStorage.clear();
});

describe('login', () => {
  it('hace POST a /api/auth/login con las credenciales y sin header Authorization', async () => {
    mockFetchOnce({ access_token: 'jwt-123' });

    const result = await login('user@test.com', 'secret');

    expect(global.fetch).toHaveBeenCalledWith(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@test.com', password: 'secret' }),
    });
    expect(result.access_token).toBe('jwt-123');
  });

  it('lanza el mensaje del backend cuando la respuesta no es ok', async () => {
    mockFetchOnce({ message: 'Credenciales inválidas', statusCode: 400 }, 400);

    await expect(login('user@test.com', 'bad')).rejects.toThrow('Credenciales inválidas');
  });

  it('une los mensajes cuando el backend devuelve un array (errores de validación)', async () => {
    mockFetchOnce({ message: ['email inválido', 'password requerido'], statusCode: 400 }, 400);

    await expect(login('x', 'y')).rejects.toThrow('email inválido, password requerido');
  });
});

describe('headers de autenticación', () => {
  it('incluye Authorization: Bearer <token> cuando hay token en localStorage', async () => {
    localStorage.setItem('ecf_token', 'mi-token');
    mockFetchOnce({ id: 'ecf-1' });

    await getEcf('ecf-1');

    expect(global.fetch).toHaveBeenCalledWith(`${API_URL}/api/ecf/ecf-1`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer mi-token',
      },
    });
  });

  it('no incluye Authorization cuando no hay token', async () => {
    mockFetchOnce({ id: 'ecf-1' });

    await getEcf('ecf-1');

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
  });
});

describe('manejo de 401', () => {
  it('limpia el token de localStorage y lanza "No autorizado"', async () => {
    localStorage.setItem('ecf_token', 'token-expirado');
    mockFetchOnce({ message: 'Unauthorized' }, 401);

    await expect(getEcf('ecf-1')).rejects.toThrow('No autorizado');
    expect(localStorage.getItem('ecf_token')).toBeNull();
  });
});

describe('listEcf', () => {
  it('construye el query string con los filtros', async () => {
    localStorage.setItem('ecf_token', 't');
    mockFetchOnce([]);

    await listEcf({ estado: 'signed', rncComprador: '101987654' });

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(`${API_URL}/api/ecf?estado=signed&rncComprador=101987654`);
  });

  it('no agrega query string sin filtros', async () => {
    mockFetchOnce([]);

    await listEcf();

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(`${API_URL}/api/ecf`);
  });
});

describe('createEcf', () => {
  it('envía el dto como body JSON', async () => {
    localStorage.setItem('ecf_token', 't');
    const dto = {
      tipoEcf: 'e-CF_31_v_1_0',
      rncEmisor: '101123456',
      nombreEmisor: 'Emisor',
      rncComprador: '101987654',
      nombreComprador: 'Comprador',
      moneda: 'RD',
      lineas: [{ descripcion: 'Servicio', cantidad: 1, precioUnitario: 100 }],
    };
    mockFetchOnce({ id: 'nuevo' });

    await createEcf(dto);

    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(`${API_URL}/api/ecf`);
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual(dto);
  });
});

describe('cancelEcf', () => {
  it('hace POST a /cancel con el motivo', async () => {
    localStorage.setItem('ecf_token', 't');
    mockFetchOnce({ estado: 'cancelled', mensaje: 'Anulado' });

    const result = await cancelEcf('ecf-9', 'Error en el monto');

    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(`${API_URL}/api/ecf/ecf-9/cancel`);
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ motivo: 'Error en el monto' });
    expect(result.estado).toBe('cancelled');
  });
});

describe('changePassword', () => {
  it('hace PATCH a /api/auth/password con ambas contraseñas', async () => {
    localStorage.setItem('ecf_token', 't');
    mockFetchOnce({ message: 'Contraseña actualizada exitosamente' });

    const result = await changePassword('Actual123!', 'Nueva1234!');

    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(`${API_URL}/api/auth/password`);
    expect(options.method).toBe('PATCH');
    expect(JSON.parse(options.body)).toEqual({
      passwordActual: 'Actual123!',
      passwordNueva: 'Nueva1234!',
    });
    expect(result.message).toBe('Contraseña actualizada exitosamente');
  });

  it('propaga el error del backend (contraseña actual incorrecta)', async () => {
    localStorage.setItem('ecf_token', 't');
    mockFetchOnce({ message: 'La contraseña actual no es correcta' }, 400);

    await expect(changePassword('mala', 'Nueva1234!')).rejects.toThrow(
      'La contraseña actual no es correcta',
    );
  });
});

describe('updatePerfil', () => {
  it('hace PATCH a /api/auth/perfil con el nombre', async () => {
    localStorage.setItem('ecf_token', 't');
    mockFetchOnce({ message: 'ok', user: { id: 'u1', nombre: 'Nuevo' } });

    await updatePerfil('Nuevo');

    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(`${API_URL}/api/auth/perfil`);
    expect(options.method).toBe('PATCH');
    expect(JSON.parse(options.body)).toEqual({ nombre: 'Nuevo' });
  });
});

describe('empresa', () => {
  it('getEmpresa hace GET a /api/empresa con auth', async () => {
    localStorage.setItem('ecf_token', 't');
    mockFetchOnce({ empresa: { id: 'e1' }, usuarios: [] });

    const result = await getEmpresa();

    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(`${API_URL}/api/empresa`);
    expect(options.headers.Authorization).toBe('Bearer t');
    expect(result.empresa.id).toBe('e1');
  });

  it('updateEmpresa hace PATCH a /api/empresa con el dto parcial', async () => {
    localStorage.setItem('ecf_token', 't');
    mockFetchOnce({ id: 'e1', telefono: '809-555-9999' });

    await updateEmpresa({ telefono: '809-555-9999' });

    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(`${API_URL}/api/empresa`);
    expect(options.method).toBe('PATCH');
    expect(JSON.parse(options.body)).toEqual({ telefono: '809-555-9999' });
  });

  it('createUsuarioEmpresa hace POST a /api/empresa/usuarios', async () => {
    localStorage.setItem('ecf_token', 't');
    mockFetchOnce({ id: 'u2', rol: 'member' }, 201);

    await createUsuarioEmpresa({
      nombre: 'María',
      email: 'maria@e.com',
      password: 'Password123!',
    });

    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(`${API_URL}/api/empresa/usuarios`);
    expect(options.method).toBe('POST');
  });

  it('deactivateUsuarioEmpresa hace DELETE a /api/empresa/usuarios/:id', async () => {
    localStorage.setItem('ecf_token', 't');
    mockFetchOnce({ message: 'Usuario desactivado exitosamente' });

    await deactivateUsuarioEmpresa('u2');

    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(`${API_URL}/api/empresa/usuarios/u2`);
    expect(options.method).toBe('DELETE');
  });
});

describe('secuencias eNCF', () => {
  it('getSecuencias hace GET a /api/empresa/secuencias', async () => {
    localStorage.setItem('ecf_token', 't');
    mockFetchOnce([
      { tipoEcf: 'e-CF_31_v_1_0', ultimaSecuencia: 0, proximoEncf: 'E310000000001' },
    ]);

    const result = await getSecuencias();

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(`${API_URL}/api/empresa/secuencias`);
    expect(result[0].proximoEncf).toBe('E310000000001');
  });

  it('setSecuencia hace PUT a /api/empresa/secuencias/:tipoEcf con el valor', async () => {
    localStorage.setItem('ecf_token', 't');
    mockFetchOnce({
      tipoEcf: 'e-CF_31_v_1_0',
      ultimaSecuencia: 100,
      proximoEncf: 'E310000000101',
    });

    await setSecuencia('e-CF_31_v_1_0', 100);

    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(`${API_URL}/api/empresa/secuencias/e-CF_31_v_1_0`);
    expect(options.method).toBe('PUT');
    expect(JSON.parse(options.body)).toEqual({ ultimaSecuencia: 100 });
  });

  it('setSecuencia propaga el 400 al intentar bajar la secuencia', async () => {
    localStorage.setItem('ecf_token', 't');
    mockFetchOnce(
      { message: 'La secuencia no puede reducirse: se re-emitirían eNCF ya utilizados' },
      400,
    );

    await expect(setSecuencia('e-CF_31_v_1_0', 1)).rejects.toThrow(
      /no puede reducirse/,
    );
  });
});

describe('getStoredUser', () => {
  it('devuelve el usuario guardado en localStorage', () => {
    localStorage.setItem(
      'ecf_user',
      JSON.stringify({ id: 'u1', email: 'a@b.com', rol: 'admin' }),
    );

    expect(getStoredUser()).toEqual({ id: 'u1', email: 'a@b.com', rol: 'admin' });
  });

  it('devuelve null si no hay usuario o el JSON es inválido', () => {
    expect(getStoredUser()).toBeNull();

    localStorage.setItem('ecf_user', '{corrupto');
    expect(getStoredUser()).toBeNull();
  });
});

describe('getResumenReporte', () => {
  it('agrega los filtros de fecha y estado al query string', async () => {
    mockFetchOnce({
      cantidad: 0,
      montoTotal: 0,
      montoITBIS: 0,
      montoItbisRetenido: 0,
      montoRentaRetenido: 0,
      porEstado: {},
      porTipo: {},
    });

    await getResumenReporte({ desde: '2026-01-01', hasta: '2026-06-30', estado: 'accepted' });

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(
      `${API_URL}/api/ecf/reportes/resumen?desde=2026-01-01&hasta=2026-06-30&estado=accepted`,
    );
  });
});
