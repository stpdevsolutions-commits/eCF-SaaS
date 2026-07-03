/**
 * Tests del formulario de nuevo e-CF (/ecf/nueva):
 * - visibilidad de los campos de retención según el tipo (31/33/34 opcional, 41 obligatorio)
 * - agregar/quitar líneas de detalle
 * - validación de retención obligatoria para e-CF 41
 * - armado del payload correcto en el submit
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NuevaEcfPage from '@/app/ecf/nueva/page';
import { createEcf } from '@/lib/api';

const push = jest.fn();
const replace = jest.fn();
const back = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, back }),
  usePathname: () => '/ecf/nueva',
}));

jest.mock('@/lib/api', () => ({
  createEcf: jest.fn(),
}));

const createEcfMock = createEcf as jest.Mock;

beforeEach(() => {
  localStorage.clear();
  // AuthGuard requiere token para renderizar el contenido
  localStorage.setItem('ecf_token', 'token-test');
});

function getTipoSelect(): HTMLSelectElement {
  // El primer combobox de la página es el selector de tipo de e-CF
  return screen.getAllByRole('combobox')[0] as HTMLSelectElement;
}

function getRetencionSelect(index = 0): HTMLSelectElement {
  // Los combobox de retención por línea vienen después del selector de tipo
  return screen.getAllByRole('combobox')[index + 1] as HTMLSelectElement;
}

async function renderPage() {
  render(<NuevaEcfPage />);
  // Espera a que AuthGuard verifique la sesión y monte el formulario
  await screen.findByText('Nuevo Comprobante Fiscal');
}

describe('NuevaEcfPage — campos de retención según tipo', () => {
  it('con el tipo 31 (default) muestra las columnas de retención como opcionales', async () => {
    await renderPage();

    expect(getTipoSelect().value).toBe('e-CF_31_v_1_0');
    expect(screen.getByRole('columnheader', { name: 'Retención' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'ITBIS Ret.' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'ISR Ret.' })).toBeInTheDocument();

    // Opcional: el select de retención no es required y no hay aviso de obligatoriedad
    expect(getRetencionSelect()).not.toBeRequired();
    expect(
      screen.queryByText(/Este tipo requiere indicar Retención\/Percepción/),
    ).not.toBeInTheDocument();
  });

  it('con el tipo 32 (consumo) oculta las columnas de retención', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.selectOptions(getTipoSelect(), 'e-CF_32_v_1_0');

    expect(screen.queryByRole('columnheader', { name: /Retención/ })).not.toBeInTheDocument();
    expect(screen.queryByText('ITBIS Ret.')).not.toBeInTheDocument();
    expect(screen.queryByText('ISR Ret.')).not.toBeInTheDocument();
    // Solo queda el combobox del tipo de e-CF
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
  });

  it.each(['e-CF_33_v_1_0', 'e-CF_34_v_1_0'])(
    'con el tipo %s muestra retención opcional',
    async (tipo) => {
      const user = userEvent.setup();
      await renderPage();

      await user.selectOptions(getTipoSelect(), tipo);

      expect(screen.getByRole('columnheader', { name: 'Retención' })).toBeInTheDocument();
      expect(getRetencionSelect()).not.toBeRequired();
    },
  );

  it('con el tipo 41 la retención es obligatoria y se muestra el aviso', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.selectOptions(getTipoSelect(), 'e-CF_41_v_1_0');

    expect(
      screen.getByText(/Este tipo requiere indicar Retención\/Percepción en cada línea/),
    ).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Retención *' })).toBeInTheDocument();
    expect(getRetencionSelect()).toBeRequired();
  });
});

describe('NuevaEcfPage — líneas de detalle', () => {
  it('agrega y quita líneas', async () => {
    const user = userEvent.setup();
    await renderPage();

    const descripcionInputs = () =>
      screen.getAllByPlaceholderText('Descripción del bien o servicio');

    // Estado inicial: 1 línea, sin botón de eliminar
    expect(descripcionInputs()).toHaveLength(1);
    expect(screen.queryByTitle('Eliminar línea')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Agregar línea/ }));
    await user.click(screen.getByRole('button', { name: /Agregar línea/ }));
    expect(descripcionInputs()).toHaveLength(3);

    // Con más de una línea aparecen los botones de eliminar
    const deleteButtons = screen.getAllByTitle('Eliminar línea');
    expect(deleteButtons).toHaveLength(3);

    await user.type(descripcionInputs()[0], 'Primera línea');
    await user.click(deleteButtons[0]);

    expect(descripcionInputs()).toHaveLength(2);
    // La línea eliminada fue la primera (su descripción ya no está)
    expect(screen.queryByDisplayValue('Primera línea')).not.toBeInTheDocument();
  });
});

describe('NuevaEcfPage — submit', () => {
  async function fillDatosBasicos(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByPlaceholderText('101-12345-6'), '101123456');
    await user.type(screen.getByPlaceholderText('Mi Empresa, S.R.L.'), 'Mi Empresa SRL');
    await user.type(screen.getByPlaceholderText('101-98765-4'), '101987654');
    await user.type(screen.getByPlaceholderText('Empresa Compradora, S.A.'), 'Cliente SA');
  }

  it('muestra error si no hay ninguna línea válida y no llama al API', async () => {
    const user = userEvent.setup();
    await renderPage();
    await fillDatosBasicos(user);

    // Sin descripción ni precio → ninguna línea válida.
    // fireEvent.submit para saltar la validación HTML5 de los campos required.
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);

    expect(
      await screen.findByText(/Agrega al menos una línea válida/),
    ).toBeInTheDocument();
    expect(createEcfMock).not.toHaveBeenCalled();
  });

  it('para el tipo 41 exige indicar retención en cada línea antes de enviar', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.selectOptions(getTipoSelect(), 'e-CF_41_v_1_0');
    await fillDatosBasicos(user);
    await user.type(
      screen.getByPlaceholderText('Descripción del bien o servicio'),
      'Compra a proveedor informal',
    );
    // spinbuttons por línea: [cantidad, precio, descuento, itbisRet, isrRet]
    const spinbuttons = screen.getAllByRole('spinbutton');
    await user.type(spinbuttons[1], '5000');

    // El select de retención queda en "— Ninguna —"
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);

    expect(
      await screen.findByText(/exige indicar Retención\/Percepción en cada línea/),
    ).toBeInTheDocument();
    expect(createEcfMock).not.toHaveBeenCalled();
  });

  it('arma el payload correcto (tipo 31 con retención) y redirige al detalle', async () => {
    const user = userEvent.setup();
    createEcfMock.mockResolvedValueOnce({ id: 'ecf-nuevo-1' });
    await renderPage();

    await fillDatosBasicos(user);
    await user.type(
      screen.getByPlaceholderText('Descripción del bien o servicio'),
      'Servicios de consultoría',
    );

    // spinbuttons: [cantidad, precio, descuento, itbisRet, isrRet]
    const spinbuttons = screen.getAllByRole('spinbutton');
    await user.clear(spinbuttons[0]);
    await user.type(spinbuttons[0], '2');
    await user.type(spinbuttons[1], '1000');
    await user.selectOptions(getRetencionSelect(), '1');
    await user.type(spinbuttons[3], '180');
    await user.type(spinbuttons[4], '200');

    await user.click(screen.getByRole('button', { name: 'Crear Comprobante' }));

    await waitFor(() => {
      expect(createEcfMock).toHaveBeenCalledTimes(1);
    });
    expect(createEcfMock).toHaveBeenCalledWith({
      tipoEcf: 'e-CF_31_v_1_0',
      rncEmisor: '101123456',
      nombreEmisor: 'Mi Empresa SRL',
      rncComprador: '101987654',
      nombreComprador: 'Cliente SA',
      moneda: 'RD',
      lineas: [
        {
          descripcion: 'Servicios de consultoría',
          cantidad: 2,
          precioUnitario: 1000,
          descuentoLinea: 0,
          indicadorAgenteRetencionoPercepcion: 1,
          montoItbisRetenido: 180,
          montoIsrRetenido: 200,
        },
      ],
    });
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/ecf/ecf-nuevo-1');
    });
  });

  it('no incluye datos de retención cuando el tipo no la soporta (E32)', async () => {
    const user = userEvent.setup();
    createEcfMock.mockResolvedValueOnce({ id: 'ecf-nuevo-2' });
    await renderPage();

    await user.selectOptions(getTipoSelect(), 'e-CF_32_v_1_0');
    await fillDatosBasicos(user);
    await user.type(
      screen.getByPlaceholderText('Descripción del bien o servicio'),
      'Venta al consumidor',
    );
    // Sin retención: spinbuttons = [cantidad, precio, descuento]
    const spinbuttons = screen.getAllByRole('spinbutton');
    await user.type(spinbuttons[1], '350.50');

    await user.click(screen.getByRole('button', { name: 'Crear Comprobante' }));

    await waitFor(() => {
      expect(createEcfMock).toHaveBeenCalledTimes(1);
    });
    const dto = createEcfMock.mock.calls[0][0];
    expect(dto.tipoEcf).toBe('e-CF_32_v_1_0');
    expect(dto.lineas).toEqual([
      {
        descripcion: 'Venta al consumidor',
        cantidad: 1,
        precioUnitario: 350.5,
        descuentoLinea: 0,
      },
    ]);
  });

  it('muestra el error del backend si createEcf falla', async () => {
    const user = userEvent.setup();
    createEcfMock.mockRejectedValueOnce(new Error('RNC del emisor inválido'));
    await renderPage();

    await fillDatosBasicos(user);
    await user.type(
      screen.getByPlaceholderText('Descripción del bien o servicio'),
      'Servicio X',
    );
    const spinbuttons = screen.getAllByRole('spinbutton');
    await user.type(spinbuttons[1], '100');

    await user.click(screen.getByRole('button', { name: 'Crear Comprobante' }));

    expect(await screen.findByText('RNC del emisor inválido')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
