import { Injectable } from '@nestjs/common';

/** Un rango de eNCF a anular (mismo tipo y serie, "Desde"/"Hasta" inclusive). */
export interface RangoENCF {
  desde: string;
  hasta: string;
}

/** Agrupación de rangos anulados para un mismo TipoeCF (una línea del detalle ANECF). */
export interface DetalleAnulacion {
  tipoEcf: number;
  rangos: RangoENCF[];
}

/**
 * Generador del XML de Anulación de e-NCF (documento ANECF de la DGII).
 *
 * Esquema basado en el documento oficial "Formato de Anulación de e-NCF
 * (ANECF)" — Gerencia de Facturación, DGII, Versión 1.0, mayo 2022:
 * https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Anulaci%C3%B3n%20de%20e-NCF%20v1.0.pdf
 *
 * Confianza: ALTA. Es la especificación oficial publicada por la propia DGII
 * (no un tercero), con descripción campo por campo (nombre de etiqueta,
 * tipo, largo, obligatoriedad) y un ejemplo de datos completo en su Anexo I,
 * que esta implementación reproduce exactamente.
 *
 * El nombre del elemento raíz (`ANECF`) no aparece impreso en el PDF (que
 * solo documenta las áreas internas Encabezado/DetalleAnulacion/Signature),
 * pero coincide con el tipo de documento que la librería `dgii-ecf` expone
 * explícitamente en `DGIIDocumentType` para este propósito, y con el nombre
 * con que la DGII y terceros (ej. Gosocket) se refieren a este formato.
 *
 * Notas de estructura confirmadas CONTRA EL XSD REAL de la DGII (validado en
 * TesteCF con un certificado real — ver script de validación manual, no
 * commiteado): el PDF describe el CONTENIDO de cada campo pero se equivoca/
 * omite dos detalles de anidamiento que el servidor sí exige:
 *  - <Version> debe ser exactamente "1.0" (no "1.00" como muestra el Anexo I
 *    del PDF) — enumeración fija del XSD (versionType), igual que en e-CF.
 *  - <TablaRangoSecuenciasAnuladaseNCF> aparece UNA sola vez por <Anulacion>
 *    (no una vez por rango); dentro de ella cada rango va envuelto en un
 *    elemento <Secuencias> con sus SecuenciaeNCFDesde/SecuenciaeNCFHasta (el
 *    PDF nunca menciona el elemento <Secuencias>, pero el XSD real lo exige:
 *    "The element 'TablaRangoSecuenciasAnuladaseNCF' has invalid child
 *    element 'SecuenciaeNCFDesde'... expected 'Secuencias'").
 *  - No existe un campo "Motivo" en este formato (a diferencia de e-CF): la
 *    DGII no lo pide para anular secuencias no emitidas/no enviadas.
 */
@Injectable()
export class EcfAnulacionService {
  /** Genera el XML ANECF completo (sin firmar) para uno o más detalles de anulación. */
  generateXml(rncEmisor: string, detalles: DetalleAnulacion[], fecha: Date = new Date()): string {
    if (!detalles.length) {
      throw new Error(
        'Debe indicar al menos un detalle de anulación (tipo de e-CF + rango de eNCF)',
      );
    }

    const cantidadTotal = detalles.reduce(
      (acc, detalle) => acc + this.contarDetalle(detalle),
      0,
    );

    const lines: string[] = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<ANECF>',
      '  <Encabezado>',
      '    <Version>1.0</Version>',
      `    <RncEmisor>${this.esc(rncEmisor)}</RncEmisor>`,
      `    <CantidadeNCFAnulados>${cantidadTotal}</CantidadeNCFAnulados>`,
      `    <FechaHoraAnulacioneNCF>${this.toDateTimeLocal(fecha)}</FechaHoraAnulacioneNCF>`,
      '  </Encabezado>',
      '  <DetalleAnulacion>',
    ];

    detalles.forEach((detalle, index) => {
      lines.push('    <Anulacion>');
      lines.push(`      <NoLinea>${index + 1}</NoLinea>`);
      lines.push(`      <TipoeCF>${detalle.tipoEcf}</TipoeCF>`);
      lines.push('      <TablaRangoSecuenciasAnuladaseNCF>');
      detalle.rangos.forEach((rango) => {
        lines.push('        <Secuencias>');
        lines.push(`          <SecuenciaeNCFDesde>${this.esc(rango.desde)}</SecuenciaeNCFDesde>`);
        lines.push(`          <SecuenciaeNCFHasta>${this.esc(rango.hasta)}</SecuenciaeNCFHasta>`);
        lines.push('        </Secuencias>');
      });
      lines.push('      </TablaRangoSecuenciasAnuladaseNCF>');
      lines.push(`      <CantidadeNCFAnulados>${this.contarDetalle(detalle)}</CantidadeNCFAnulados>`);
      lines.push('    </Anulacion>');
    });

    lines.push('  </DetalleAnulacion>');
    lines.push('</ANECF>');

    return lines.join('\n');
  }

  /** Construye el ANECF para anular un único eNCF puntual (rango de longitud 1). */
  generateXmlParaUnEncf(
    rncEmisor: string,
    tipoEcf: number,
    encf: string,
    fecha: Date = new Date(),
  ): string {
    return this.generateXml(
      rncEmisor,
      [{ tipoEcf, rangos: [{ desde: encf, hasta: encf }] }],
      fecha,
    );
  }

  // ── Helpers privados ────────────────────────────────────────────────────────

  private contarDetalle(detalle: DetalleAnulacion): number {
    return detalle.rangos.reduce((acc, rango) => acc + this.contarRango(rango), 0);
  }

  private contarRango(rango: RangoENCF): number {
    return this.extraerSecuencia(rango.hasta) - this.extraerSecuencia(rango.desde) + 1;
  }

  /** eNCF: 1 letra de serie (E-Z) + 2 dígitos de tipo + 10 dígitos de secuencia. */
  private extraerSecuencia(encf: string): number {
    return Number(encf.slice(3));
  }

  /** Formato de fecha DGII: DD-MM-YYYY (igual que EcfXmlService). */
  private toFecha(date: Date): string {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  }

  /** Formato de fecha-hora exigido por el formato ANECF: DD-MM-YYYY HH:MM:SS. */
  private toDateTimeLocal(date: Date): string {
    const hh = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${this.toFecha(date)} ${hh}:${mi}:${ss}`;
  }

  /** Escapa caracteres especiales XML en valores de texto. */
  private esc(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
