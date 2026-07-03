/**
 * Tests de la página de login: render, redirección si ya hay sesión,
 * submit exitoso (guarda token y redirige) y manejo de error 401.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from '@/app/login/page';
import { login } from '@/lib/api';

const push = jest.fn();
const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, back: jest.fn() }),
}));

jest.mock('@/lib/api', () => ({
  login: jest.fn(),
}));

const loginMock = login as jest.Mock;

beforeEach(() => {
  localStorage.clear();
});

describe('LoginPage', () => {
  it('renderiza los campos de email, contraseña y el botón de submit', () => {
    render(<LoginPage />);

    expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('redirige al dashboard si ya existe un token guardado', () => {
    localStorage.setItem('ecf_token', 'token-existente');

    render(<LoginPage />);

    expect(replace).toHaveBeenCalledWith('/dashboard');
  });

  it('con credenciales válidas guarda el token y redirige al dashboard', async () => {
    const user = userEvent.setup();
    loginMock.mockResolvedValueOnce({ access_token: 'jwt-nuevo' });

    render(<LoginPage />);

    await user.type(screen.getByLabelText('Correo electrónico'), 'admin@empresa.com');
    await user.type(screen.getByLabelText('Contraseña'), 'secreto123');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/dashboard');
    });
    expect(loginMock).toHaveBeenCalledWith('admin@empresa.com', 'secreto123');
    expect(localStorage.getItem('ecf_token')).toBe('jwt-nuevo');
  });

  it('muestra el mensaje de error cuando el backend rechaza las credenciales (401)', async () => {
    const user = userEvent.setup();
    loginMock.mockRejectedValueOnce(new Error('Credenciales inválidas'));

    render(<LoginPage />);

    await user.type(screen.getByLabelText('Correo electrónico'), 'admin@empresa.com');
    await user.type(screen.getByLabelText('Contraseña'), 'incorrecta');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(await screen.findByText('Credenciales inválidas')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(localStorage.getItem('ecf_token')).toBeNull();
  });

  it('deshabilita el botón mientras el login está en curso', async () => {
    const user = userEvent.setup();
    let resolveLogin!: (v: { access_token: string }) => void;
    loginMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLogin = resolve;
      }),
    );

    render(<LoginPage />);

    await user.type(screen.getByLabelText('Correo electrónico'), 'admin@empresa.com');
    await user.type(screen.getByLabelText('Contraseña'), 'secreto123');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(screen.getByRole('button', { name: /Ingresando/ })).toBeDisabled();

    resolveLogin({ access_token: 'jwt' });
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'));
  });
});
