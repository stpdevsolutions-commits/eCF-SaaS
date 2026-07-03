/**
 * Tests de la página de reportes (/reportes):
 * carga del resumen, desglose por estado/tipo, filtros y descarga CSV.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReportesPage from '@/app/reportes/page';
import { getResumenReporte, descargarReporteCsv } from '@/lib/api';
import { ResumenReporte } from '@/lib/types';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  usePathname: () => '/reportes',
}));

jest.mock('@/lib/api', () => ({
  getResumenReporte: jest.fn(),
  descargarReporteCsv: jest.fn(),
}));

const getResumenMock = getResumenReporte as jest.Mock;
const descargarCsvMock = descargarReporteCsv as jest.Mock;

const resumen: ResumenReporte = {
  cantidad: 12,
  montoTotal: 45000,
  montoITBIS: 8100,
  montoItbisRetenido: 500,
  montoRentaRetenido: 250,
  porEstado: { draft: 3, accepted: 9 },
  porTipo: { 'e-CF_31_v_1_0': 7, 'e-CF_41_v_1_0': 5 },
};

function formatRD(n: number) {
  return `RD$ ${n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('ecf_token', 'token-test');
});

describe('ReportesPage', () => {
  it('carga el resumen al montar y muestra totales y desgloses', async () => {
    getResumenMock.mockResolvedValue(resumen);

    render(<ReportesPage />);

    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(getResumenMock).toHaveBeenCalledWith({
      desde: undefined,
      hasta: undefined,
      estado: undefined,
    });

    expect(screen.getByText(formatRD(45000))).toBeInTheDocument();
    expect(screen.getByText(formatRD(8100))).toBeInTheDocument();
    // Retenciones = ITBIS retenido + ISR retenido
    expect(screen.getByText(formatRD(750))).toBeInTheDocument();

    // Desglose por estado (scoped a su card, para no chocar con el select de filtro)
    const porEstadoCard = screen.getByText('Por Estado').closest('.card') as HTMLElement;
    expect(within(porEstadoCard).getByText('Borrador')).toBeInTheDocument();
    expect(within(porEstadoCard).getByText('3')).toBeInTheDocument();
    expect(within(porEstadoCard).getByText('Aceptado')).toBeInTheDocument();
    expect(within(porEstadoCard).getByText('9')).toBeInTheDocument();

    // Desglose por tipo
    const porTipoCard = screen.getByText('Por Tipo de e-CF').closest('.card') as HTMLElement;
    expect(within(porTipoCard).getByText('e-CF_31_v_1_0')).toBeInTheDocument();
    expect(within(porTipoCard).getByText('7')).toBeInTheDocument();
    expect(within(porTipoCard).getByText('e-CF_41_v_1_0')).toBeInTheDocument();
    expect(within(porTipoCard).getByText('5')).toBeInTheDocument();
  });

  it('al filtrar vuelve a pedir el resumen con los filtros elegidos', async () => {
    const user = userEvent.setup();
    getResumenMock.mockResolvedValue(resumen);

    render(<ReportesPage />);
    await screen.findByText('12');

    const [desdeInput, hastaInput] = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[type="date"]'),
    );
    await user.type(desdeInput, '2026-01-01');
    await user.type(hastaInput, '2026-06-30');
    await user.selectOptions(screen.getByRole('combobox'), 'accepted');
    await user.click(screen.getByRole('button', { name: 'Filtrar' }));

    await waitFor(() => {
      expect(getResumenMock).toHaveBeenLastCalledWith({
        desde: '2026-01-01',
        hasta: '2026-06-30',
        estado: 'accepted',
      });
    });
  });

  it('descarga el CSV con los filtros actuales', async () => {
    const user = userEvent.setup();
    getResumenMock.mockResolvedValue(resumen);
    descargarCsvMock.mockResolvedValue(undefined);

    render(<ReportesPage />);
    await screen.findByText('12');

    await user.selectOptions(screen.getByRole('combobox'), 'signed');
    await user.click(screen.getByRole('button', { name: /CSV/ }));

    await waitFor(() => {
      expect(descargarCsvMock).toHaveBeenCalledWith({
        desde: undefined,
        hasta: undefined,
        estado: 'signed',
      });
    });
  });

  it('muestra el error si el resumen no se puede cargar', async () => {
    getResumenMock.mockRejectedValue(new Error('Error interno del servidor'));

    render(<ReportesPage />);

    expect(await screen.findByText('Error interno del servidor')).toBeInTheDocument();
  });
});
