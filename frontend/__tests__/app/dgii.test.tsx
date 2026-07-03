/**
 * Tests de la página de conexión con la DGII (/dgii):
 * autenticación exitosa (muestra expiración) y manejo de error.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DgiiPage from '@/app/dgii/page';
import { authenticateDgii } from '@/lib/api';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  usePathname: () => '/dgii',
}));

jest.mock('@/lib/api', () => ({
  authenticateDgii: jest.fn(),
}));

const authenticateDgiiMock = authenticateDgii as jest.Mock;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('ecf_token', 'token-test');
});

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText('101-12345-6'), ' 101123456 ');
  const textboxes = screen.getAllByRole('textbox');
  await user.type(textboxes[1], 'usuario-ofv');
  const claveInput = document.querySelector('input[type="password"]') as HTMLInputElement;
  await user.type(claveInput, 'clave-secreta');
  await user.click(screen.getByRole('button', { name: 'Conectar con la DGII' }));
}

describe('DgiiPage', () => {
  it('autenticación exitosa muestra la expiración del token en minutos', async () => {
    const user = userEvent.setup();
    authenticateDgiiMock.mockResolvedValueOnce({ token: 'dgii-token', expiresIn: 3600 });

    render(<DgiiPage />);
    await screen.findByText('Conexión con la DGII');

    await fillAndSubmit(user);

    expect(await screen.findByText(/expira en\s+60 minutos/)).toBeInTheDocument();
    // Los valores van sin espacios sobrantes (trim)
    expect(authenticateDgiiMock).toHaveBeenCalledWith('101123456', 'usuario-ofv', 'clave-secreta');
  });

  it('muestra el mensaje de error si la autenticación falla', async () => {
    const user = userEvent.setup();
    authenticateDgiiMock.mockRejectedValueOnce(new Error('Credenciales DGII inválidas'));

    render(<DgiiPage />);
    await screen.findByText('Conexión con la DGII');

    await fillAndSubmit(user);

    expect(await screen.findByText('Credenciales DGII inválidas')).toBeInTheDocument();
  });
});
