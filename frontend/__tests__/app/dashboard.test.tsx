/**
 * Tests del dashboard (consulta de comprobantes): render del listado con las
 * nuevas columnas/acciones, estado vacío, filtros avanzados y manejo de error.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardPage from '@/app/dashboard/page';
import { descargarXmlEcf, listEcf } from '@/lib/api';
import { Ecf } from '@/lib/types';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  usePathname: () => '/dashboard',
}));

jest.mock('@/lib/api', () => ({
  listEcf: jest.fn(),
  descargarXmlEcf: jest.fn(),
}));

const listEcfMock = listEcf as jest.Mock;
const descargarXmlEcfMock = descargarXmlEcf as jest.Mock;

function baseEcf(overrides: Partial<Ecf> = {}): Ecf {
  return {
    id: 'ecf-1',
    tipoEcf: 'e-CF_31_v_1_0',
    version: '1.0',
    encf: 'E310000000001',
    fechaEmision: '2026-06-15T12:00:00.000Z',
    rncEmisor: '101123456',
    nombreEmisor: 'Mi Empresa SRL',
    tipoPago: 1,
    tipoIngresos: '01',
    rncComprador: '101987654',
    nombreComprador: 'Cliente Uno SA',
    estado: 'draft',
    montoTotal: 1180,
    montoDescuento: 0,
    montoITBIS: 180,
    montoItbisRetenido: 0,
    montoRentaRetenido: 0,
    aplicaPropinaLegal: false,
    montoPropinaLegal: 0,
    moneda: 'RD',
    createdAt: '2026-06-15T12:00:00.000Z',
    updatedAt: '2026-06-15T12:00:00.000Z',
    ...overrides,
  };
}

const ecfs: Ecf[] = [
  baseEcf(),
  baseEcf({
    id: 'ecf-2',
    tipoEcf: 'e-CF_32_v_1_0',
    encf: 'E320000000002',
    fechaEmision: '2026-06-16T12:00:00.000Z',
    rncComprador: '131222333',
    nombreComprador: 'Cliente Dos SRL',
    estado: 'accepted',
    montoTotal: 590,
    montoITBIS: 90,
    uuid: 'aabbccdd-1122-3344-5566-778899aabbcc',
  }),
];

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('ecf_token', 'token-test');
  listEcfMock.mockReset();
  descargarXmlEcfMock.mockReset();
});

describe('DashboardPage', () => {
  it('lista los comprobantes con e-NCF, comprador, montos y estados', async () => {
    listEcfMock.mockResolvedValue(ecfs);

    render(<DashboardPage />);

    expect(await screen.findByText('Cliente Uno SA')).toBeInTheDocument();
    expect(screen.getByText('Cliente Dos SRL')).toBeInTheDocument();
    expect(screen.getByText('2 comprobantes')).toBeInTheDocument();

    expect(screen.getByText('E310000000001')).toBeInTheDocument();
    expect(screen.getByText('E320000000002')).toBeInTheDocument();

    const table = screen.getByRole('table');
    expect(within(table).getByText('Borrador')).toBeInTheDocument();
    // "Aceptado" aparece dos veces: badge de Estado Factura + columna Estado DGII
    expect(within(table).getAllByText('Aceptado').length).toBeGreaterThan(0);

    // Acciones: Ver e Imprimir para todos, Editar solo para el borrador
    const links = screen.getAllByRole('link', { name: 'Ver' });
    expect(links[0]).toHaveAttribute('href', '/ecf/ecf-1');
    expect(links[1]).toHaveAttribute('href', '/ecf/ecf-2');
    expect(screen.getAllByRole('link', { name: 'Imprimir' })).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Editar' })).toHaveAttribute(
      'href',
      '/ecf/ecf-1/editar',
    );
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

  it('al filtrar por e-NCF y presionar Filtrar vuelve a pedir el listado con los filtros', async () => {
    const user = userEvent.setup();
    listEcfMock.mockResolvedValue(ecfs);

    render(<DashboardPage />);
    await screen.findByText('Cliente Uno SA');

    expect(listEcfMock).toHaveBeenCalledWith({
      estado: undefined,
      rncComprador: undefined,
      tipoEcf: undefined,
      encf: undefined,
      fechaDesde: undefined,
      fechaHasta: undefined,
    });

    listEcfMock.mockResolvedValue([ecfs[1]]);
    await user.type(screen.getByPlaceholderText('E310000000001'), 'E320000000002');
    await user.click(screen.getByRole('button', { name: 'Filtrar' }));

    await waitFor(() => {
      expect(listEcfMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ encf: 'E320000000002' }),
      );
    });
    await waitFor(() => {
      expect(screen.queryByText('Cliente Uno SA')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Cliente Dos SRL')).toBeInTheDocument();
  });

  it('descarga el XML al presionar el botón de acción', async () => {
    const user = userEvent.setup();
    listEcfMock.mockResolvedValue(ecfs);
    descargarXmlEcfMock.mockResolvedValue(undefined);

    render(<DashboardPage />);
    await screen.findByText('Cliente Uno SA');

    await user.click(screen.getAllByRole('button', { name: 'XML' })[0]);

    await waitFor(() => {
      expect(descargarXmlEcfMock).toHaveBeenCalledWith('ecf-1');
    });
  });

  it('muestra el error si el listado falla', async () => {
    listEcfMock.mockRejectedValue(new Error('Error al conectar con el servidor'));

    render(<DashboardPage />);

    expect(await screen.findByText('Error al conectar con el servidor')).toBeInTheDocument();
  });
});
