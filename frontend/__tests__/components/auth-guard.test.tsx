/**
 * Tests de AuthGuard: redirige a /login sin token y renderiza el contenido con token.
 */
import { render, screen, waitFor } from '@testing-library/react';
import AuthGuard from '@/components/AuthGuard';

const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace, back: jest.fn() }),
}));

beforeEach(() => {
  localStorage.clear();
});

describe('AuthGuard', () => {
  it('sin token redirige a /login y no renderiza el contenido protegido', async () => {
    render(
      <AuthGuard>
        <p>Contenido secreto</p>
      </AuthGuard>,
    );

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/login');
    });
    expect(screen.queryByText('Contenido secreto')).not.toBeInTheDocument();
    expect(screen.getByText('Verificando sesión…')).toBeInTheDocument();
  });

  it('con token renderiza el contenido protegido sin redirigir', async () => {
    localStorage.setItem('ecf_token', 'token-valido');

    render(
      <AuthGuard>
        <p>Contenido secreto</p>
      </AuthGuard>,
    );

    expect(await screen.findByText('Contenido secreto')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
