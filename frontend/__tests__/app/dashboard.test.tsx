/**
 * Tests del dashboard (listado de comprobantes):
 * render del listado, estado vacío, filtro por estado y manejo de error.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardPage from '@/app/dashboard/page';
import { listEcf } from '@/lib/api';
import { Ecf } from '@/lib/types';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  usePathname: () => '/dashboard',
}));

jest.mock('@/lib/api', () => ({
  listEcf: jest.fn(),
}));

const listEcfMock = listEcf as jest.Mock;

const ecfs: Ecf[] = [
  {
    id: 'ecf-1',
    tipoEcf: 'e-CF_31_v_1_0',
    version: '1.0',
    fechaEmision: '2026-06-15T12:00:00.000Z',
    rncEmisor: '101123456',
    nombreEmisor: 'Mi Empresa SRL',
    rncComprador: '101987654',
    nombreComprador: 'Cliente Uno SA',
    estado: 'draft',
    montoTotal: 1180,
    montoDescuento: 0,
    montoITBIS: 180,
    montoItbisRetenido: 0,
    montoRentaRetenido: 0,
    moneda: 'RD',
    createdAt: '2026-06-15T12:00:00.000Z',
    updatedAt: '2026-06-15T12:00:00.000Z',
  },
  {
    id: 'ecf-2',
    tipoEcf: 'e-CF_32_v_1_0',
    version: '1.0',
    fechaEmision: '2026-06-16T12:00:00.000Z',
    rncEmisor: '101123456',
    nombreEmisor: 'Mi Empresa SRL',
    rncComprador: '131222333',
    nombreComprador: 'Cliente Dos SRL',
    estado: 'accepted',
    montoTotal: 590,
    montoDescuento: 0,
    montoITBIS: 90,
    montoItbisRetenido: 0,
    montoRentaRetenido: 0,
    moneda: 'RD',
    uuid: 'aabbccdd-1122-3344-5566-778899aabbcc',
    createdAt: '2026-06-16T12:00:00.000Z',
    updatedAt: '2026-06-16T12:00:00.000Z',
  },
];

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('ecf_token', 'token-test');
});

describe('DashboardPage', () => {
  it('lista los comprobantes con tipo abreviado, comprador, estado y enlace al detalle', async () => {
    listEcfMock.mockResolvedValue(ecfs);

    render(<DashboardPage />);

    expect(await screen.findByText('Cliente Uno SA')).toBeInTheDocument();
    expect(screen.getByText('Cliente Dos SRL')).toBeInTheDocument();
    expect(screen.getByText('2 comprobantes')).toBeInTheDocument();

    // Tipo abreviado: 'e-CF_31_v_1_0' → 'E31'
    expect(screen.getByText('E31')).toBeInTheDocument();
    expect(screen.getByText('E32')).toBeInTheDocument();

    // Badges de estado (dentro de la tabla, para no chocar con el select de filtro)
    const table = screen.getByRole('table');
    expect(within(table).getByText('Borrador')).toBeInTheDocument();
    expect(within(table).getByText('Aceptado')).toBeInTheDocument();

    // UUID truncado a 8 caracteres para el transmitido, 'Sin asignar' para el borrador
    expect(screen.getByText('aabbccdd…')).toBeInTheDocument();
    expect(screen.getByText('Sin asignar')).toBeInTheDocument();

    // Enlaces al detalle
    const links = screen.getAllByRole('link', { name: 'Ver →' });
    expect(links[0]).toHaveAttribute('href', '/ecf/ecf-1');
    expect(links[1]).toHaveAttribute('href', '/ecf/ecf-2');
  });

  it('muestra el estado vacío cuando no hay comprobantes', async () => {
    listEcfMock.mockResolvedValue([]);

    render(<DashboardPage />);

    expect(await screen.findByText('No hay comprobantes')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Crear el primero' })).toHaveAttribute(
      'href',
      '/ecf/nueva',
    );
  });

  it('al cambiar el filtro de estado vuelve a pedir el listado filtrado', async () => {
    const user = userEvent.setup();
    listEcfMock.mockResolvedValue(ecfs);

    render(<DashboardPage />);
    await screen.findByText('Cliente Uno SA');

    expect(listEcfMock).toHaveBeenCalledWith(undefined);

    listEcfMock.mockResolvedValue([ecfs[1]]);
    await user.selectOptions(screen.getByRole('combobox'), 'accepted');

    await waitFor(() => {
      expect(listEcfMock).toHaveBeenLastCalledWith({ estado: 'accepted' });
    });
    await waitFor(() => {
      expect(screen.queryByText('Cliente Uno SA')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Cliente Dos SRL')).toBeInTheDocument();
  });

  it('muestra el error si el listado falla', async () => {
    listEcfMock.mockRejectedValue(new Error('Error al conectar con el servidor'));

    render(<DashboardPage />);

    expect(await screen.findByText('Error al conectar con el servidor')).toBeInTheDocument();
  });
});
