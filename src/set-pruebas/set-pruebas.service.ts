import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { DOMParser } from '@xmldom/xmldom';
import { EcfXmlService } from '../ecf/services/ecf-xml.service';
import { EcfSigningService } from '../ecf/services/ecf-signing.service';
import { XsdValidatorService } from '../validation/xsd-validator.service';
import { leerExcelSetPruebas } from './set-pruebas-excel.reader';
import { mapearFila } from './set-pruebas.mapper';
import { XsdRealValidator } from './xsd-real.validator';
import { OpcionesImportacion, ReporteSetPruebas, ResultadoFila } from './set-pruebas.types';

/**
 * Importador del Set de Pruebas de la DGII (Excel → XML de e-CF).
 *
 * Flujo por cada fila del Excel: mapear al modelo propio → validar campos →
 * generar el XML con el MISMO EcfXmlService del flujo normal → validar la
 * estructura y contra el XSD oficial. Si todas las filas salen OK y no es
 * dry-run, firma cada XML con EcfSigningService (flujo normal) y los deja en
 * `directorioSalida` con el nombre `{RNCEmisor}{eNCF}.xml` (el mismo que usa
 * DgiiService al transmitir).
 *
 * GARANTÍA: este servicio NO transmite nada. No depende de DgiiService ni del
 * cliente HTTP de dgii-ecf; el envío a la recepción de CerteCF queda fuera de
 * alcance a propósito (requiere el OK explícito de Pedro y credenciales).
 *
 * Política "todo o nada": la DGII reinicia el set completo si un e-CF sale
 * rechazado, así que si alguna fila tiene error NO se firma ni se escribe
 * ningún XML firmado.
 */
/** Error de libxml2 por la ausencia de <Signature> (xs:any obligatorio) en un XML aún sin firmar. */
const ERROR_FALTA_FIRMA = /Element 'ECF': Missing child element\(s\)\. Expected is one of \( \{\*\}\*, \* \)/;

export class SetPruebasService {
  constructor(
    private readonly xmlService: EcfXmlService,
    private readonly validator: XsdValidatorService,
    private readonly xsdReal: XsdRealValidator,
    private readonly signing?: EcfSigningService,
  ) {}

  async importar(origen: Buffer | string, opciones: OpcionesImportacion = {}): Promise<ReporteSetPruebas> {
    const dryRun = opciones.dryRun !== false; // dry-run por defecto
    const mensajes: string[] = [];
    if (!dryRun && !opciones.directorioSalida) {
      throw new Error('Sin dry-run se requiere directorioSalida donde dejar los XML firmados');
    }
    if (!dryRun && !this.signing) {
      throw new Error('Sin dry-run se requiere EcfSigningService para firmar');
    }

    const lectura = await leerExcelSetPruebas(origen);
    const filas: ResultadoFila[] = [];
    const xmls: { fila: ResultadoFila; xml: string; nombreArchivo: string }[] = [];
    const columnasNoSoportadas = new Set<string>();
    const encfVistos = new Map<string, string>();

    for (const hoja of lectura.hojas) {
      for (const cruda of hoja.filas) {
        cruda.columnasSinMapear.forEach((c) => columnasNoSoportadas.add(c));
        const mapeada = mapearFila(cruda, hoja.tipo!, this.validator);
        const resultado: ResultadoFila = {
          hoja: hoja.nombre,
          fila: cruda.numeroFila,
          caso: mapeada.caso,
          tipo: hoja.tipo,
          encf: mapeada.encf,
          estado: 'OK',
          errores: [...mapeada.errores],
          advertencias: [...mapeada.advertencias],
        };

        if (mapeada.encf) {
          const previo = encfVistos.get(mapeada.encf);
          if (previo) resultado.errores.push(`eNCF repetido en el set (ya usado en ${previo})`);
          else encfVistos.set(mapeada.encf, `${hoja.nombre} fila ${cruda.numeroFila}`);
        }

        let xml: string | undefined;
        if (resultado.errores.length === 0) {
          try {
            xml = this.xmlService.generateXml(mapeada.ecf, 1, mapeada.opcionesXml);
            await this.validarXml(xml, hoja.tipo!, mapeada.ecf.tipoEcf, resultado);
          } catch (e) {
            resultado.errores.push(`No se pudo generar el XML: ${(e as Error).message}`);
          }
        }

        if (resultado.errores.length > 0) resultado.estado = 'ERROR';
        else if (xml) {
          const rnc = mapeada.ecf.rncEmisor ?? '';
          xmls.push({ fila: resultado, xml, nombreArchivo: `${rnc}${mapeada.encf}.xml` });
        }
        filas.push(resultado);
      }
    }

    const conErrores = filas.filter((f) => f.estado === 'ERROR').length;
    const reporte: ReporteSetPruebas = {
      dryRun,
      transmitido: false,
      totalFilas: filas.length,
      ok: filas.length - conErrores,
      conErrores,
      firmado: false,
      hojasOmitidas: lectura.hojasOmitidas,
      columnasNoSoportadas: [...columnasNoSoportadas],
      filas,
      mensajes,
    };

    if (filas.length === 0) {
      mensajes.push('El Excel no contiene ninguna fila de datos reconocible.');
    }
    if (reporte.hojasOmitidas.length > 0) {
      mensajes.push(`${reporte.hojasOmitidas.length} hoja(s) omitida(s); ver hojasOmitidas.`);
    }
    if (reporte.columnasNoSoportadas.length > 0) {
      mensajes.push(
        `Hay columnas con datos que no se mapean al XML (${reporte.columnasNoSoportadas.join(', ')}). ` +
          'El XML generado NO las incluye: revisa que el set no las exija.',
      );
    }

    if (dryRun) {
      mensajes.push('DRY-RUN: no se firmó ni se transmitió nada.');
      if (opciones.directorioSalida) {
        this.escribir(opciones.directorioSalida, xmls, 'sin-firmar', false);
        mensajes.push(`XML SIN firmar escritos en ${join(opciones.directorioSalida, 'sin-firmar')}.`);
      }
    } else if (conErrores > 0 || filas.length === 0) {
      mensajes.push(
        'No se firmó nada: hay filas con error (el set de la DGII se reinicia completo si un e-CF sale rechazado). Corrige y reintenta.',
      );
    } else {
      const firmante = this.signing as EcfSigningService;
      const firmados: typeof xmls = [];
      for (const item of xmls) {
        const xmlFirmado = await firmante.signXml(item.xml);
        // Se revalida YA firmado (el XSD completo exige <Signature>): si algo falla, no se escribe nada.
        await this.validarXml(xmlFirmado, item.fila.tipo as number, `e-CF_${item.fila.tipo}_v_1_0`, item.fila, true);
        if (item.fila.errores.length > 0) item.fila.estado = 'ERROR';
        firmados.push({ ...item, xml: xmlFirmado });
      }
      reporte.conErrores = filas.filter((f) => f.estado === 'ERROR').length;
      reporte.ok = filas.length - reporte.conErrores;
      if (reporte.conErrores > 0) {
        mensajes.push('El XML firmado no pasó la validación contra el XSD: no se escribió ningún archivo firmado.');
        if (opciones.directorioSalida) {
          mkdirSync(opciones.directorioSalida, { recursive: true });
          writeFileSync(join(opciones.directorioSalida, 'reporte.json'), JSON.stringify(reporte, null, 2), 'utf-8');
        }
        return reporte;
      }
      this.escribir(opciones.directorioSalida as string, firmados, 'firmados', true);
      reporte.firmado = true;
      reporte.certificado = (await firmante.usaCertificadoReal()) ? 'p12-real' : 'desarrollo';
      mensajes.push(`XML firmados escritos en ${join(opciones.directorioSalida as string, 'firmados')}. NO se transmitió nada.`);
      if (reporte.certificado === 'desarrollo') {
        mensajes.push('ATENCIÓN: se firmó con el certificado AUTOFIRMADO de desarrollo; CerteCF lo rechazará. Configura DGII_CERT_P12_BASE64 + DGII_CERT_PASSPHRASE.');
      }
    }

    if (opciones.directorioSalida) {
      mkdirSync(opciones.directorioSalida, { recursive: true });
      writeFileSync(join(opciones.directorioSalida, 'reporte.json'), JSON.stringify(reporte, null, 2), 'utf-8');
    }
    return reporte;
  }

  /** Bien formado + estructura mínima del proyecto + XSD oficial. */
  private async validarXml(
    xml: string,
    tipo: number,
    tipoEcf: string,
    resultado: ResultadoFila,
    firmado = false,
  ): Promise<void> {
    const errorParseo: string[] = [];
    new DOMParser({
      errorHandler: {
        warning: () => undefined,
        error: (m: string) => errorParseo.push(m),
        fatalError: (m: string) => errorParseo.push(m),
      },
    }).parseFromString(xml, 'text/xml');
    if (errorParseo.length > 0) {
      resultado.errores.push(`XML mal formado: ${errorParseo[0]}`);
      return;
    }

    const estructura = this.validator.validateXmlStructure(xml, tipoEcf);
    // Sin firma es lo esperado en esta etapa: no se reporta como advertencia.
    resultado.errores.push(...estructura.errors);
    resultado.advertencias.push(...estructura.warnings.filter((w) => !w.includes('firma digital')));

    try {
      let erroresXsd = await this.xsdReal.validar(xml, tipo);
      // El XSD exige el elemento <Signature> (xs:any); sin firmar es lo esperado en esta etapa.
      if (!firmado) erroresXsd = erroresXsd.filter((e) => !ERROR_FALTA_FIRMA.test(e));
      resultado.errores.push(...erroresXsd.slice(0, 10).map((e) => `XSD: ${e}`));
      if (erroresXsd.length > 10) resultado.errores.push(`XSD: ... y ${erroresXsd.length - 10} error(es) más`);
    } catch (e) {
      resultado.advertencias.push(`No se pudo validar contra el XSD: ${(e as Error).message}`);
    }
  }

  private escribir(
    dir: string,
    items: { fila: ResultadoFila; xml: string; nombreArchivo: string }[],
    subcarpeta: string,
    marcarArchivo: boolean,
  ): void {
    const destino = join(dir, subcarpeta);
    mkdirSync(destino, { recursive: true });
    for (const item of items) {
      writeFileSync(join(destino, item.nombreArchivo), item.xml, 'utf-8');
      if (marcarArchivo) item.fila.archivo = join(subcarpeta, item.nombreArchivo);
    }
  }
}
