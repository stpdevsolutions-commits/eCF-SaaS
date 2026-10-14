import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { Socket } from 'net';
import { join } from 'path';
import * as ExcelJS from 'exceljs';
import { ConfigService } from '@nestjs/config';
import { DgiiCertificateService } from '../dgii/dgii-certificate.service';
import { EcfSigningService } from '../ecf/services/ecf-signing.service';
import { EcfXmlService } from '../ecf/services/ecf-xml.service';
import { XsdValidatorService } from '../validation/xsd-validator.service';
import { casoValido, crearExcelPrueba, FilaDict, hojaDesdeCasos } from './set-pruebas.fixture';
import { SetPruebasService } from './set-pruebas.service';
import { XsdRealValidator } from './xsd-real.validator';
import { leerExcelSetPruebas, tipoDesdeNombreHoja } from './set-pruebas-excel.reader';

const TIPOS = [31, 32, 33, 34, 41, 43, 44, 45, 46, 47];

function crearServicio(conFirma = false) {
  // ConfigService "vacío": nunca toma el certificado real del entorno; la firma usa el certificado
  // de DESARROLLO autogenerado en memoria (el real NO se usa jamás en pruebas).
  const config = { get: () => undefined } as unknown as ConfigService;
  const firma = conFirma ? new EcfSigningService(new DgiiCertificateService(config)) : undefined;
  return new SetPruebasService(
    new EcfXmlService(),
    new XsdValidatorService(),
    new XsdRealValidator(join(process.cwd(), 'src/validation/schemas')),
    firma,
  );
}

const excelDeTodosLosTipos = () =>
  crearExcelPrueba(TIPOS.map((t) => hojaDesdeCasos(`E${t}`, [casoValido(t)])));

describe('Importador del Set de Pruebas (ECF-9)', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'set-pruebas-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  describe('lectura del Excel', () => {
    it('deduce el tipo por el nombre de la hoja', () => {
      expect(tipoDesdeNombreHoja('E31')).toBe(31);
      expect(tipoDesdeNombreHoja('e-CF 47 Pagos Exterior')).toBe(47);
      expect(tipoDesdeNombreHoja('Hoja 131')).toBeUndefined();
      expect(tipoDesdeNombreHoja('Instrucciones')).toBeUndefined();
    });

    it('reconoce encabezados sin importar mayúsculas/acentos y sufijos de ítem [n], (n) y _n', async () => {
      const buf = await crearExcelPrueba([
        {
          nombre: 'ECF 31',
          encabezados: ['ENCF', 'rnc emisor', 'Razón Social Emisor', 'NombreItem[1]', 'CantidadItem(2)', 'PrecioUnitarioItem_2'],
          filas: [['E310000000001', '130000001', 'ACME', 'A', 3, 10]],
        },
      ]);
      const lectura = await leerExcelSetPruebas(buf);
      const fila = lectura.hojas[0].filas[0];
      expect(lectura.hojas[0].tipo).toBe(31);
      expect(fila.campos).toMatchObject({ eNCF: 'E310000000001', RNCEmisor: '130000001', RazonSocialEmisor: 'ACME' });
      expect(fila.items.get(1)).toEqual({ NombreItem: 'A' });
      expect(fila.items.get(2)).toEqual({ CantidadItem: 3, PrecioUnitarioItem: 10 });
    });

    it('omite y reporta las hojas sin encabezados reconocibles o sin tipo', async () => {
      const wb = new ExcelJS.Workbook();
      wb.addWorksheet('Instrucciones').addRow(['Lea esto primero']);
      const ws = wb.addWorksheet('Casos');
      ws.addRow(['eNCF', 'RNCEmisor', 'FechaEmision']);
      ws.addRow(['E310000000001', '130000001', '01-01-2026']);
      const buf = Buffer.from(await wb.xlsx.writeBuffer());

      const lectura = await leerExcelSetPruebas(buf);

      expect(lectura.hojas).toHaveLength(0);
      expect(lectura.hojasOmitidas.map((h) => h.nombre)).toEqual(['Instrucciones', 'Casos']);
    });
  });

  describe('dry-run (por defecto)', () => {
    it('genera y valida los 10 tipos contra el XSD oficial sin firmar ni transmitir', async () => {
      const reporte = await crearServicio().importar(await excelDeTodosLosTipos());

      expect(reporte.dryRun).toBe(true);
      expect(reporte.transmitido).toBe(false);
      expect(reporte.firmado).toBe(false);
      expect(reporte.totalFilas).toBe(10);
      expect(reporte.filas.filter((f) => f.estado === 'ERROR').map((f) => [f.hoja, f.errores])).toEqual([]);
      expect(reporte.ok).toBe(10);
      expect(reporte.mensajes.join(' ')).toContain('DRY-RUN');
    });

    it('no escribe nada en disco si no se pide directorio de salida', async () => {
      const antes = readdirSync(tmp);
      await crearServicio().importar(await excelDeTodosLosTipos());
      expect(readdirSync(tmp)).toEqual(antes);
    });

    it('con directorio de salida deja solo XML SIN firmar y el reporte', async () => {
      const reporte = await crearServicio().importar(await excelDeTodosLosTipos(), { directorioSalida: tmp });

      expect(reporte.firmado).toBe(false);
      const sinFirmar = readdirSync(join(tmp, 'sin-firmar'));
      expect(sinFirmar).toHaveLength(10);
      expect(sinFirmar).toContain('130000001E310000000001.xml');
      expect(readFileSync(join(tmp, 'sin-firmar', sinFirmar[0]), 'utf-8')).not.toContain('<Signature');
      expect(existsSync(join(tmp, 'firmados'))).toBe(false);
      expect(JSON.parse(readFileSync(join(tmp, 'reporte.json'), 'utf-8')).transmitido).toBe(false);
    });

    it('NUNCA hace llamadas de red (fetch y sockets TCP), ni siquiera al firmar', async () => {
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('red prohibida'));
      const conectar = jest.spyOn(Socket.prototype, 'connect');

      await crearServicio(true).importar(await excelDeTodosLosTipos(), { dryRun: false, directorioSalida: tmp });

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(conectar).not.toHaveBeenCalled();
    }, 60_000);
  });

  describe('reporte por fila (OK / error con motivo)', () => {
    const importar = async (casos: FilaDict[], hoja = 'E31') =>
      crearServicio().importar(await crearExcelPrueba([hojaDesdeCasos(hoja, casos)]));

    it('marca ERROR con el motivo cuando el eNCF no corresponde al tipo de la hoja', async () => {
      const r = await importar([casoValido(31, 1, { eNCF: 'E320000000001' })]);
      expect(r.filas[0].estado).toBe('ERROR');
      expect(r.filas[0].errores.join(' ')).toContain('no corresponde al tipo 31');
    });

    it('detecta totales declarados en el Excel que no cuadran con los calculados', async () => {
      const r = await importar([casoValido(31, 1, { MontoTotal: 999, TotalITBIS: 30 })]);
      const errores = r.filas[0].errores.join(' | ');
      expect(r.filas[0].estado).toBe('ERROR');
      expect(errores).toContain('MontoTotal del Excel (999)');
      expect(errores).toContain('TotalITBIS del Excel (30)');
    });

    it('detecta MontoItem que no cuadra con cantidad x precio', async () => {
      const r = await importar([casoValido(31, 1, { 'MontoItem[1]': 150 })]);
      expect(r.filas[0].errores.join(' ')).toContain('MontoItem del Excel (150)');
    });

    it('reporta fecha inválida, falta de fecha de vencimiento y de RNC', async () => {
      const r = await importar([
        casoValido(31, 1, { FechaEmision: '31-02-2026' }),
        casoValido(31, 2, { FechaVencimientoSecuencia: undefined }),
        casoValido(31, 3, { RNCComprador: undefined }),
      ]);
      expect(r.filas[0].errores.join(' ')).toContain('FechaEmision inválida');
      expect(r.filas[1].errores.join(' ')).toContain('Falta FechaVencimientoSecuencia');
      expect(r.filas[2].errores.join(' ')).toContain('RNC Comprador inválido');
    });

    it('reporta eNCF repetido dentro del set y sigue procesando el resto', async () => {
      const r = await importar([casoValido(31, 1), casoValido(31, 1), casoValido(31, 2)]);
      expect(r.filas.map((f) => f.estado)).toEqual(['OK', 'ERROR', 'OK']);
      expect(r.filas[1].errores.join(' ')).toContain('eNCF repetido');
      expect(r.ok).toBe(2);
      expect(r.conErrores).toBe(1);
    });

    it('reporta ítems incompletos y e-CF 41 sin indicador de retención', async () => {
      const r41 = await importar([casoValido(41, 1, { 'IndicadorAgenteRetencionoPercepcion[1]': undefined })], 'E41');
      expect(r41.filas[0].errores.join(' ')).toContain('el e-CF 41 exige IndicadorAgenteRetencionoPercepcion');

      const r = await importar([casoValido(31, 1, { 'NombreItem[1]': undefined, 'CantidadItem[1]': 0 })]);
      expect(r.filas[0].errores.join(' ')).toContain('falta NombreItem');
      expect(r.filas[0].errores.join(' ')).toContain('CantidadItem debe ser mayor a 0');
    });

    it('exige la referencia en notas de crédito/débito', async () => {
      const r = await importar([casoValido(33, 1, { NCFModificado: undefined })], 'E33');
      expect(r.filas[0].estado).toBe('ERROR');
      expect(r.filas[0].errores.join(' ')).toContain('referencia');
    });

    it('avisa de las columnas con datos que no se pueden mapear (no las ignora en silencio)', async () => {
      const r = await importar([casoValido(31, 1, { ColumnaRara: 'x' })]);
      expect(r.filas[0].estado).toBe('OK');
      expect(r.filas[0].advertencias.join(' ')).toContain('ColumnaRara');
      expect(r.columnasNoSoportadas).toEqual(['ColumnaRara']);
    });

    it('acepta celdas de fecha de Excel (Date) y números como texto', async () => {
      const r = await importar([
        casoValido(31, 1, { FechaEmision: new Date(Date.UTC(2026, 9, 14)), 'PrecioUnitarioItem[1]': '100.00', TipoIngresos: '01' }),
      ]);
      expect(r.filas[0].errores).toEqual([]);
    });

    it('soporta varios ítems con tasas mezcladas', async () => {
      const r = await importar([
        casoValido(31, 1, {
          MontoGravadoTotal: 300,
          MontoGravadoI1: 200,
          MontoGravadoI2: 100,
          TotalITBIS: 52,
          TotalITBIS1: 36,
          TotalITBIS2: 16,
          MontoTotal: 352,
          'NumeroLinea[2]': 2,
          'IndicadorFacturacion[2]': 2,
          'NombreItem[2]': 'Otro',
          'IndicadorBienoServicio[2]': 1,
          'CantidadItem[2]': 1,
          'PrecioUnitarioItem[2]': 100,
          'MontoItem[2]': 100,
        }),
      ]);
      expect(r.filas[0].errores).toEqual([]);
    });
  });

  describe('modo real (--no-dry-run): firma local, jamás transmite', () => {
    it('exige directorio de salida y firmante', async () => {
      const buf = await excelDeTodosLosTipos();
      await expect(crearServicio(true).importar(buf, { dryRun: false })).rejects.toThrow('directorioSalida');
      await expect(crearServicio(false).importar(buf, { dryRun: false, directorioSalida: tmp })).rejects.toThrow('EcfSigningService');
    });

    it('firma los 10 XML con el certificado de desarrollo, los valida firmados contra el XSD completo y los escribe', async () => {
      const reporte = await crearServicio(true).importar(await excelDeTodosLosTipos(), { dryRun: false, directorioSalida: tmp });

      expect(reporte.transmitido).toBe(false);
      expect(reporte.firmado).toBe(true);
      expect(reporte.certificado).toBe('desarrollo');
      expect(reporte.conErrores).toBe(0);
      expect(reporte.mensajes.join(' ')).toContain('AUTOFIRMADO');
      const archivos = readdirSync(join(tmp, 'firmados'));
      expect(archivos).toHaveLength(10);
      const xml = readFileSync(join(tmp, 'firmados', '130000001E310000000001.xml'), 'utf-8');
      expect(xml).toContain('<Signature');
      expect(xml).toContain('<FechaHoraFirma>');
      expect(reporte.filas[0].archivo).toBe(join('firmados', '130000001E310000000001.xml'));
    }, 60_000);

    it('todo o nada: si una fila falla no se firma ni se escribe ningún XML', async () => {
      const buf = await crearExcelPrueba([hojaDesdeCasos('E31', [casoValido(31, 1), casoValido(31, 2, { MontoTotal: 1 })])]);

      const reporte = await crearServicio(true).importar(buf, { dryRun: false, directorioSalida: tmp });

      expect(reporte.firmado).toBe(false);
      expect(reporte.ok).toBe(1);
      expect(reporte.conErrores).toBe(1);
      expect(existsSync(join(tmp, 'firmados'))).toBe(false);
      expect(reporte.mensajes.join(' ')).toContain('No se firmó nada');
    });
  });
});
