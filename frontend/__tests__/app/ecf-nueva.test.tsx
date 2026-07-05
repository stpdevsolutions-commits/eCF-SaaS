/**
 * Tests del formulario de nuevo e-CF (/ecf/nueva):
 * - ya no pide datos del emisor (se toman de la Empresa)
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

// Orden de los <select> en el formulario: Tipo e-CF, Tipo de Pago, Tipo de
// Ingreso (encabezado), y por cada línea: Bien/Servicio, Unidad de Medida,
// Itbis (tasa), [Retención si el tipo la soporta].
function getTipoSelect(): HTMLSelectElement {
  return screen.getAllByRole('combobox')[0] as HTMLSelectElement;
}

function getRetencionSelect(): HTMLSelectElement {
  // Asume una sola línea de detalle (como en estos tests).
  return screen.getAllByRole('combobox')[6] as HTMLSelectElement;
}

async function renderPage() {
  render(<NuevaEcfPage />);
  // Espera a que AuthGuard verifique la sesión y monte el formulario
  await screen.findByText('Nuevo Comprobante Fiscal');
}

async function fillComprador(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText('101-98765-4'), '101987654');
  await user.type(screen.getByPlaceholderText('Empresa Compradora, S.A.'), 'Cliente SA');
}

describe('NuevaEcfPage — sin datos del emisor', () => {
  it('no pide RNC ni razón social del emisor (se toman de la Empresa)', async () => {
    await renderPage();

    expect(screen.queryByText('Datos del Emisor')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('101-12345-6')).not.toBeInTheDocument();
    expect(
      screen.getByText('Los datos del emisor se toman de tu empresa (Opciones → Empresa).'),
    ).toBeInTheDocument();
  });
});

describe('NuevaEcfPage — campos de retención según tipo', () => {
  it('con el tipo 31 (default) muestra las columnas de retención como opcionales', async () => {
    await renderPage();

    expect(getTipoSelect().value).toBe('e-CF_31_v_1_0');
    expect(screen.getByText('Retención', { selector: 'label' })).toBeInTheDocument();
    expect(screen.getByText('ITBIS Retenido (RD$)')).toBeInTheDocument();
    expect(screen.getByText('ISR Retenido (RD$)')).toBeInTheDocument();

    expect(getRetencionSelect()).not.toBeRequired();
    expect(
      screen.queryByText(/Este tipo requiere indicar Retención\/Percepción/),
    ).not.toBeInTheDocument();
  });

  it('con el tipo 32 (consumo) oculta las columnas de retención', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.selectOptions(getTipoSelect(), 'e-CF_32_v_1_0');

    expect(screen.queryByText('Retención', { selector: 'label' })).not.toBeInTheDocument();
    expect(screen.queryByText('ITBIS Retenido (RD$)')).not.toBeInTheDocument();
    expect(screen.queryByText('ISR Retenido (RD$)')).not.toBeInTheDocument();
  });

  it.each(['e-CF_33_v_1_0', 'e-CF_34_v_1_0'])(
    'con el tipo %s muestra retención opcional',
    async (tipo) => {
      const user = userEvent.setup();
      await renderPage();

      await user.selectOptions(getTipoSelect(), tipo);

      expect(screen.getByText('Retención', { selector: 'label' })).toBeInTheDocument();
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
    expect(screen.getByText('Retención *')).toBeInTheDocument();
    expect(getRetencionSelect()).toBeRequired();
  });
});

describe('NuevaEcfPage — líneas de detalle', () => {
  it('agrega y quita líneas', async () => {
    const user = userEvent.setup();
    await renderPage();

    const descripcionInputs = () =>
      screen.getAllByPlaceholderText('Descripción del bien o servicio');

    expect(descripcionInputs()).toHaveLength(1);
    expect(screen.queryByTitle('Eliminar línea')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Agregar línea/ }));
    await user.click(screen.getByRole('button', { name: /Agregar línea/ }));
    expect(descripcionInputs()).toHaveLength(3);

    const deleteButtons = screen.getAllByTitle('Eliminar línea');
    expect(deleteButtons).toHaveLength(3);

    await user.type(descripcionInputs()[0], 'Primera línea');
    await user.click(deleteButtons[0]);

    expect(descripcionInputs()).toHaveLength(2);
    expect(screen.queryByDisplayValue('Primera línea')).not.toBeInTheDocument();
  });
});

describe('NuevaEcfPage — submit', () => {
  it('muestra error si no hay ninguna línea válida y no llama al API', async () => {
    const user = userEvent.setup();
    await renderPage();
    await fillComprador(user);

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
    await fillComprador(user);
    await user.type(
      screen.getByPlaceholderText('Descripción del bien o servicio'),
      'Compra a proveedor informal',
    );
    const spinbuttons = screen.getAllByRole('spinbutton');
    await user.type(spinbuttons[1], '5000');

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

    await fillComprador(user);
    await user.type(
      screen.getByPlaceholderText('Descripción del bien o servicio'),
      'Servicios de consultoría',
    );

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
    const dto = createEcfMock.mock.calls[0][0];
    expect(dto).toEqual(
      expect.objectContaining({
        tipoEcf: 'e-CF_31_v_1_0',
        tipoPago: 1,
        tipoIngresos: '01',
        rncComprador: '101987654',
        nombreComprador: 'Cliente SA',
        moneda: 'RD',
        aplicaPropinaLegal: false,
        lineas: [
          {
            descripcion: 'Servicios de consultoría',
            indicadorBienoServicio: 1,
            unidadMedida: 43,
            indicadorFacturacion: 1,
            cantidad: 2,
            precioUnitario: 1000,
            descuentoLinea: 0,
            indicadorAgenteRetencionoPercepcion: 1,
            montoItbisRetenido: 180,
            montoIsrRetenido: 200,
          },
        ],
      }),
    );
    expect(typeof dto.fechaEmision).toBe('string');
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/ecf/ecf-nuevo-1');
    });
  });

  it('no incluye datos de retención cuando el tipo no la soporta (E32)', async () => {
    const user = userEvent.setup();
    createEcfMock.mockResolvedValueOnce({ id: 'ecf-nuevo-2' });
    await renderPage();

    await user.selectOptions(getTipoSelect(), 'e-CF_32_v_1_0');
    await fillComprador(user);
    await user.type(
      screen.getByPlaceholderText('Descripción del bien o servicio'),
      'Venta al consumidor',
    );
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
        indicadorBienoServicio: 1,
        unidadMedida: 43,
        indicadorFacturacion: 1,
        cantidad: 1,
        precioUnitario: 350.5,
        descuentoLinea: 0,
      },
    ]);
  });

  it('muestra el error del backend si createEcf falla', async () => {
    const user = userEvent.setup();
    createEcfMock.mockRejectedValueOnce(new Error('Datos del comprador inválidos'));
    await renderPage();

    await fillComprador(user);
    await user.type(
      screen.getByPlaceholderText('Descripción del bien o servicio'),
      'Servicio X',
    );
    const spinbuttons = screen.getAllByRole('spinbutton');
    await user.type(spinbuttons[1], '100');

    await user.click(screen.getByRole('button', { name: 'Crear Comprobante' }));

    expect(await screen.findByText('Datos del comprador inválidos')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
