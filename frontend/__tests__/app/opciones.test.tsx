/**
 * Tests de la página de Opciones (/opciones): visibilidad por rol
 * (admin vs member), cambio de contraseña, actualización de nombre,
 * fijado de secuencias eNCF y gestión de usuarios del equipo.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OpcionesPage from '@/app/opciones/page';
import {
  changePassword,
  createUsuarioEmpresa,
  deactivateUsuarioEmpresa,
  getEmpresa,
  getSecuencias,
  getStoredUser,
  setSecuencia,
  updateEmpresa,
  updatePerfil,
} from '@/lib/api';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  usePathname: () => '/opciones',
}));

jest.mock('@/lib/api', () => ({
  changePassword: jest.fn(),
  createUsuarioEmpresa: jest.fn(),
  deactivateUsuarioEmpresa: jest.fn(),
  getEmpresa: jest.fn(),
  getMe: jest.fn(),
  getSecuencias: jest.fn(),
  getStoredUser: jest.fn(),
  saveStoredUser: jest.fn(),
  setSecuencia: jest.fn(),
  updateEmpresa: jest.fn(),
  updatePerfil: jest.fn(),
}));

const getStoredUserMock = getStoredUser as jest.Mock;
const getEmpresaMock = getEmpresa as jest.Mock;
const getSecuenciasMock = getSecuencias as jest.Mock;
const setSecuenciaMock = setSecuencia as jest.Mock;
const changePasswordMock = changePassword as jest.Mock;
const updatePerfilMock = updatePerfil as jest.Mock;
const updateEmpresaMock = updateEmpresa as jest.Mock;
const createUsuarioMock = createUsuarioEmpresa as jest.Mock;
const deactivateUsuarioMock = deactivateUsuarioEmpresa as jest.Mock;

const adminUser = {
  id: 'u-admin',
  email: 'admin@empresa.com',
  nombre: 'Admin',
  rol: 'admin',
  empresaId: 'e1',
};

const memberUser = {
  id: 'u-member',
  email: 'miembro@empresa.com',
  nombre: 'Miembro',
  rol: 'member',
  empresaId: 'e1',
};

const secuencias = [
  { tipoEcf: 'e-CF_31_v_1_0', ultimaSecuencia: 5, proximoEncf: 'E310000000006' },
  { tipoEcf: 'e-CF_32_v_1_0', ultimaSecuencia: 0, proximoEncf: 'E320000000001' },
];

const empresaResponse = {
  empresa: {
    id: 'e1',
    rnc: '101234567',
    razonSocial: 'Mi Empresa SRL',
    nombreComercial: 'Mi Empresa',
    direccion: 'Calle 1',
    telefono: '809-555-0100',
    tipoContribuyente: 'regimen_ordinario',
    activo: true,
    createdAt: '',
    updatedAt: '',
  },
  usuarios: [
    { id: 'u-admin', nombre: 'Admin', email: 'admin@empresa.com', rol: 'admin', activo: true, createdAt: '' },
    { id: 'u-member', nombre: 'Miembro', email: 'miembro@empresa.com', rol: 'member', activo: true, createdAt: '' },
  ],
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('ecf_token', 'token-test');
  getSecuenciasMock.mockResolvedValue(secuencias);
  getEmpresaMock.mockResolvedValue(empresaResponse);
});

describe('OpcionesPage — member', () => {
  beforeEach(() => {
    getStoredUserMock.mockReturnValue(memberUser);
  });

  it('muestra Mi cuenta y las secuencias en solo lectura, sin secciones de admin', async () => {
    render(<OpcionesPage />);

    expect(await screen.findByText('Mi cuenta')).toBeInTheDocument();
    expect(await screen.findByText('E310000000006')).toBeInTheDocument();

    // Sin secciones de admin
    expect(screen.queryByText('Empresa')).not.toBeInTheDocument();
    expect(screen.queryByText('Usuarios del equipo')).not.toBeInTheDocument();
    // Sin edición de secuencias
    expect(screen.queryByRole('button', { name: 'Fijar' })).not.toBeInTheDocument();
    expect(getEmpresaMock).not.toHaveBeenCalled();
  });

  it('valida que las contraseñas nuevas coincidan antes de llamar a la API', async () => {
    const user = userEvent.setup();
    render(<OpcionesPage />);
    await screen.findByText('Mi cuenta');

    await user.type(screen.getByLabelText('Contraseña actual'), 'Actual123!');
    await user.type(screen.getByLabelText('Nueva contraseña'), 'Nueva1234!');
    await user.type(screen.getByLabelText('Confirmar nueva contraseña'), 'Distinta1!');
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    expect(await screen.findByText('Las contraseñas no coinciden')).toBeInTheDocument();
    expect(changePasswordMock).not.toHaveBeenCalled();
  });

  it('cambia la contraseña y muestra el mensaje de éxito', async () => {
    const user = userEvent.setup();
    changePasswordMock.mockResolvedValueOnce({
      message: 'Contraseña actualizada exitosamente',
    });

    render(<OpcionesPage />);
    await screen.findByText('Mi cuenta');

    await user.type(screen.getByLabelText('Contraseña actual'), 'Actual123!');
    await user.type(screen.getByLabelText('Nueva contraseña'), 'Nueva1234!');
    await user.type(screen.getByLabelText('Confirmar nueva contraseña'), 'Nueva1234!');
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    expect(
      await screen.findByText('Contraseña actualizada exitosamente'),
    ).toBeInTheDocument();
    expect(changePasswordMock).toHaveBeenCalledWith('Actual123!', 'Nueva1234!');
  });

  it('muestra el error del backend cuando la contraseña actual es incorrecta', async () => {
    const user = userEvent.setup();
    changePasswordMock.mockRejectedValueOnce(
      new Error('La contraseña actual no es correcta'),
    );

    render(<OpcionesPage />);
    await screen.findByText('Mi cuenta');

    await user.type(screen.getByLabelText('Contraseña actual'), 'Incorrecta!');
    await user.type(screen.getByLabelText('Nueva contraseña'), 'Nueva1234!');
    await user.type(screen.getByLabelText('Confirmar nueva contraseña'), 'Nueva1234!');
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    expect(
      await screen.findByText('La contraseña actual no es correcta'),
    ).toBeInTheDocument();
  });

  it('actualiza el nombre del usuario', async () => {
    const user = userEvent.setup();
    updatePerfilMock.mockResolvedValueOnce({
      message: 'Perfil actualizado exitosamente',
      user: { ...memberUser, nombre: 'Miembro Nuevo' },
    });

    render(<OpcionesPage />);
    await screen.findByText('Mi cuenta');

    const nombreInput = screen.getByLabelText('Nombre');
    await user.clear(nombreInput);
    await user.type(nombreInput, 'Miembro Nuevo');
    await user.click(screen.getByRole('button', { name: 'Guardar nombre' }));

    expect(
      await screen.findByText('Perfil actualizado exitosamente'),
    ).toBeInTheDocument();
    expect(updatePerfilMock).toHaveBeenCalledWith('Miembro Nuevo');
  });
});

describe('OpcionesPage — admin', () => {
  beforeEach(() => {
    getStoredUserMock.mockReturnValue(adminUser);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('muestra las secciones de empresa y usuarios, con el RNC de solo lectura', async () => {
    render(<OpcionesPage />);

    // "Usuarios del equipo" solo aparece cuando getEmpresa() ya resolvió
    expect(await screen.findByText('Usuarios del equipo')).toBeInTheDocument();
    expect(screen.getByText('Empresa')).toBeInTheDocument();

    const rncInput = screen.getByDisplayValue('101234567') as HTMLInputElement;
    expect(rncInput).toBeDisabled();

    // Usuarios listados
    expect(screen.getByText('miembro@empresa.com')).toBeInTheDocument();
  });

  it('guarda los datos de la empresa', async () => {
    const user = userEvent.setup();
    updateEmpresaMock.mockResolvedValueOnce({
      ...empresaResponse.empresa,
      telefono: '809-555-9999',
    });

    render(<OpcionesPage />);

    const telefonoInput = await screen.findByLabelText('Teléfono');
    await user.clear(telefonoInput);
    await user.type(telefonoInput, '809-555-9999');
    await user.click(screen.getByRole('button', { name: 'Guardar empresa' }));

    expect(
      await screen.findByText('Datos de la empresa actualizados'),
    ).toBeInTheDocument();
    expect(updateEmpresaMock).toHaveBeenCalledWith({
      razonSocial: 'Mi Empresa SRL',
      nombreComercial: 'Mi Empresa',
      direccion: 'Calle 1',
      logoBase64: '',
      telefono: '809-555-9999',
    });
  });

  it('fija una secuencia tras confirmar y muestra el nuevo próximo eNCF', async () => {
    const user = userEvent.setup();
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    setSecuenciaMock.mockResolvedValueOnce({
      tipoEcf: 'e-CF_31_v_1_0',
      ultimaSecuencia: 100,
      proximoEncf: 'E310000000101',
    });

    render(<OpcionesPage />);
    await screen.findByText('E310000000006');

    const input = screen.getByLabelText('Nueva secuencia e-CF_31_v_1_0');
    await user.clear(input);
    await user.type(input, '100');
    await user.click(screen.getAllByRole('button', { name: 'Fijar' })[0]);

    await waitFor(() =>
      expect(setSecuenciaMock).toHaveBeenCalledWith('e-CF_31_v_1_0', 100),
    );
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining('NO puede bajarse'),
    );
    expect(await screen.findByText('E310000000101')).toBeInTheDocument();
  });

  it('impide bajar la secuencia sin llamar a la API', async () => {
    const user = userEvent.setup();
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

    render(<OpcionesPage />);
    await screen.findByText('E310000000006');

    const input = screen.getByLabelText('Nueva secuencia e-CF_31_v_1_0');
    await user.clear(input);
    await user.type(input, '2'); // menor que la actual (5)
    await user.click(screen.getAllByRole('button', { name: 'Fijar' })[0]);

    expect(
      await screen.findByText(/La secuencia no puede bajarse/),
    ).toBeInTheDocument();
    expect(setSecuenciaMock).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('no fija la secuencia si el admin cancela la confirmación', async () => {
    const user = userEvent.setup();
    jest.spyOn(window, 'confirm').mockReturnValue(false);

    render(<OpcionesPage />);
    await screen.findByText('E310000000006');

    const input = screen.getByLabelText('Nueva secuencia e-CF_31_v_1_0');
    await user.clear(input);
    await user.type(input, '100');
    await user.click(screen.getAllByRole('button', { name: 'Fijar' })[0]);

    expect(window.confirm).toHaveBeenCalled();
    expect(setSecuenciaMock).not.toHaveBeenCalled();
  });

  it('crea un usuario member del equipo', async () => {
    const user = userEvent.setup();
    createUsuarioMock.mockResolvedValueOnce({
      id: 'u-nuevo',
      nombre: 'Nuevo',
      email: 'nuevo@empresa.com',
      rol: 'member',
      activo: true,
      createdAt: '',
    });

    render(<OpcionesPage />);
    await screen.findByText('Usuarios del equipo');

    await user.type(screen.getByLabelText('Nombre del usuario'), 'Nuevo');
    await user.type(screen.getByLabelText('Email del usuario'), 'nuevo@empresa.com');
    await user.type(screen.getByLabelText('Contraseña del usuario'), 'Password123!');
    await user.click(screen.getByRole('button', { name: 'Crear usuario' }));

    expect(await screen.findByText('Usuario creado exitosamente')).toBeInTheDocument();
    expect(createUsuarioMock).toHaveBeenCalledWith({
      nombre: 'Nuevo',
      email: 'nuevo@empresa.com',
      password: 'Password123!',
    });
  });

  it('desactiva un usuario tras confirmar (y no se puede desactivar a sí mismo)', async () => {
    const user = userEvent.setup();
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    deactivateUsuarioMock.mockResolvedValueOnce({
      message: 'Usuario desactivado exitosamente',
      usuario: {},
    });

    render(<OpcionesPage />);
    await screen.findByText('Usuarios del equipo');

    // Solo hay un botón "Desactivar": el del member (el admin no puede
    // desactivarse a sí mismo).
    const botones = screen.getAllByRole('button', { name: 'Desactivar' });
    expect(botones).toHaveLength(1);

    await user.click(botones[0]);

    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() =>
      expect(deactivateUsuarioMock).toHaveBeenCalledWith('u-member'),
    );
    expect(
      await screen.findByText('Usuario desactivado exitosamente'),
    ).toBeInTheDocument();
  });
});
