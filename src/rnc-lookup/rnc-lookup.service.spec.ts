import { Test, TestingModule } from '@nestjs/testing';
import { RncLookupService } from './rnc-lookup.service';

/** HTML mínimo de la página inicial (GET) con los hidden fields de ASP.NET WebForms. */
function htmlSesionInicial(): string {
  return `<html><body><form>
    <input type="hidden" id="__VIEWSTATE" value="viewstate-abc" />
    <input type="hidden" id="__EVENTVALIDATION" value="eventvalidation-abc" />
    <input type="hidden" id="__VIEWSTATEGENERATOR" value="generator-abc" />
  </form></body></html>`;
}

/** Respuesta AJAX (pipe-delimited) que envuelve el HTML con la tabla label→valor de un RNC encontrado. */
function ajaxRncEncontrado(): string {
  const fragment = `<div>
    <table>
      <tr><td>Cédula/RNC</td><td>132-94305-8</td></tr>
      <tr><td>Nombre/Razón Social</td><td>SOLUCIONES TECNICAS PROFESIONALES STP SRL</td></tr>
      <tr><td>Nombre Comercial</td><td>SOLUCIONES TECNICAS PROFESIONALES STP</td></tr>
      <tr><td>Categoría</td><td></td></tr>
      <tr><td>Régimen de pagos</td><td>NORMAL</td></tr>
      <tr><td>Estado</td><td>ACTIVO</td></tr>
      <tr><td>Actividad Economica</td><td>SERVICIOS DE INGENIERÍA</td></tr>
      <tr><td>Administracion Local</td><td>ADM LOCAL HERRERA</td></tr>
      <tr><td>Facturador Electrónico</td><td>SI</td></tr>
    </table>
  </div>`;
  return `1234|updatePanel|ctl00_cphMain_upBusqueda|${fragment}|0|hiddenField|__VIEWSTATE|nuevo-viewstate|`;
}

/** Respuesta AJAX cuando el RNC no existe en el padrón. */
function ajaxRncNoEncontrado(): string {
  const fragment = `<div><span id="cphMain_lblInformacion">RNC no encontrado</span></div>`;
  return `999|updatePanel|ctl00_cphMain_upBusqueda|${fragment}|0|hiddenField|__VIEWSTATE|nuevo-viewstate|`;
}

describe('RncLookupService', () => {
  let service: RncLookupService;
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RncLookupService],
    }).compile();

    service = module.get(RncLookupService);

    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('devuelve los datos del contribuyente cuando el RNC existe en el padrón', async () => {
    fetchMock
      .mockResolvedValueOnce({ text: () => Promise.resolve(htmlSesionInicial()), headers: new Headers() })
      .mockResolvedValueOnce({ text: () => Promise.resolve(ajaxRncEncontrado()), headers: new Headers() });

    const resultado = await service.buscarPorRnc('132943058');

    expect(resultado.found).toBe(true);
    expect(resultado.rnc).toBe('132943058');
    expect(resultado.razonSocial).toBe('SOLUCIONES TECNICAS PROFESIONALES STP SRL');
    expect(resultado.nombreComercial).toBe('SOLUCIONES TECNICAS PROFESIONALES STP');
    expect(resultado.estado).toBe('ACTIVO');
    expect(resultado.esFacturadorElectronico).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('limpia el RNC de guiones/espacios antes de consultar', async () => {
    fetchMock
      .mockResolvedValueOnce({ text: () => Promise.resolve(htmlSesionInicial()), headers: new Headers() })
      .mockResolvedValueOnce({ text: () => Promise.resolve(ajaxRncEncontrado()), headers: new Headers() });

    await service.buscarPorRnc('132-94305-8');

    const postBody = fetchMock.mock.calls[1][1].body as string;
    expect(postBody).toContain('132943058');
  });

  it('devuelve found:false con el mensaje de la DGII cuando el RNC no existe', async () => {
    fetchMock
      .mockResolvedValueOnce({ text: () => Promise.resolve(htmlSesionInicial()), headers: new Headers() })
      .mockResolvedValueOnce({ text: () => Promise.resolve(ajaxRncNoEncontrado()), headers: new Headers() });

    const resultado = await service.buscarPorRnc('101000099');

    expect(resultado.found).toBe(false);
    expect(resultado.mensaje).toBe('RNC no encontrado');
  });

  it('rechaza sin llamar a la DGII si el RNC no tiene 9-11 dígitos', async () => {
    const resultado = await service.buscarPorRnc('123');

    expect(resultado.found).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('degrada a found:false si la consulta a la DGII falla (sin lanzar excepción)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('timeout'));

    const resultado = await service.buscarPorRnc('132943058');

    expect(resultado.found).toBe(false);
    expect(resultado.mensaje).toBe('No se pudo consultar la DGII en este momento');
  });
});
