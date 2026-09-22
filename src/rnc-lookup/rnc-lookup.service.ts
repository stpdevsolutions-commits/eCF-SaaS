import { Injectable, Logger } from '@nestjs/common';

const RNC_URL = 'https://dgii.gov.do/app/WebApps/ConsultasWeb2/ConsultasWeb/consultas/rnc.aspx';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

interface AspxSession {
  viewState: string;
  eventValidation: string;
  viewStateGenerator: string;
  cookie: string;
}

export interface RncLookupResult {
  found: boolean;
  rnc: string;
  mensaje?: string;
  razonSocial?: string;
  nombreComercial?: string;
  categoria?: string;
  regimenPago?: string;
  estado?: string;
  actividadEconomica?: string;
  administracionLocal?: string;
  esFacturadorElectronico?: boolean;
}

/**
 * Consulta el padrón público de contribuyentes de la DGII por RNC/Cédula,
 * para autocompletar razón social al crear un e-CF — mismo enfoque que ya
 * usa en producción FiscoRD (supabase/functions/validate-rnc), scrapeando
 * el portal ASP.NET WebForms de consultas (el SOAP legacy wsMovilDGII.asmx
 * fue decomisionado por la DGII).
 *
 * FRÁGIL POR DISEÑO: si la DGII cambia el HTML/IDs de este formulario, esto
 * deja de funcionar hasta que se actualicen los selectores — no hay API
 * oficial equivalente hoy. Se degrada a "no encontrado" sin romper la
 * creación manual del e-CF (el campo de razón social sigue editable).
 */
@Injectable()
export class RncLookupService {
  private readonly logger = new Logger(RncLookupService.name);

  async buscarPorRnc(rncCrudo: string): Promise<RncLookupResult> {
    const rnc = rncCrudo.replace(/\D/g, '');
    if (rnc.length < 9 || rnc.length > 11) {
      return { found: false, rnc, mensaje: 'RNC/Cédula debe tener 9-11 dígitos' };
    }

    try {
      const session = await this.fetchAspxSession(RNC_URL);
      const html = await this.postAspxForm(
        RNC_URL,
        session,
        'ctl00$cphMain$upBusqueda|ctl00$cphMain$btnBuscarPorRNC',
        {
          'ctl00$cphMain$txtRNCCedula': rnc,
          'ctl00$cphMain$txtRazonSocial': '',
        },
        'ctl00$cphMain$btnBuscarPorRNC',
        'BUSCAR',
      );

      if (this.hasElement(html, 'cphMain_lblInformacion')) {
        return {
          found: false,
          rnc,
          mensaje: this.extractSpan(html, 'cphMain_lblInformacion') || 'RNC no encontrado',
        };
      }

      const campos = this.extractLabelValueTable(html);
      const razonSocial = this.getField(campos, 'nombre/razón social', 'nombre/razon social');
      if (!razonSocial) {
        return { found: false, rnc, mensaje: 'RNC no encontrado' };
      }

      return {
        found: true,
        rnc: this.getField(campos, 'cédula/rnc', 'cedula/rnc').replace(/\D/g, '') || rnc,
        razonSocial,
        nombreComercial: this.getField(campos, 'nombre comercial') || undefined,
        categoria: this.getField(campos, 'categoría', 'categoria') || undefined,
        regimenPago: this.getField(campos, 'régimen de pagos', 'regimen de pagos') || undefined,
        estado: this.getField(campos, 'estado') || 'ACTIVO',
        actividadEconomica:
          this.getField(campos, 'actividad económica', 'actividad economica') || undefined,
        administracionLocal:
          this.getField(campos, 'administración local', 'administracion local') || undefined,
        esFacturadorElectronico:
          this.getField(campos, 'facturador electrónico', 'facturador electronico')
            .trim()
            .toUpperCase() === 'SI',
      };
    } catch (error) {
      this.logger.warn(
        `No se pudo consultar el RNC ${rnc} en el padrón de la DGII: ${
          error instanceof Error ? error.message : error
        }`,
      );
      return { found: false, rnc, mensaje: 'No se pudo consultar la DGII en este momento' };
    }
  }

  // ── Sesión ASP.NET WebForms (postback AJAX) ──────────────────────────────────

  private async fetchAspxSession(url: string): Promise<AspxSession> {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'es-DO,es;q=0.9' },
      signal: AbortSignal.timeout(10_000),
    });
    const html = await res.text();
    return {
      viewState: this.extractHidden(html, '__VIEWSTATE'),
      eventValidation: this.extractHidden(html, '__EVENTVALIDATION'),
      viewStateGenerator: this.extractHidden(html, '__VIEWSTATEGENERATOR'),
      cookie: this.extractCookie(res.headers),
    };
  }

  private async postAspxForm(
    url: string,
    session: AspxSession,
    asyncTarget: string,
    fields: Record<string, string>,
    submitField: string,
    submitValue: string,
  ): Promise<string> {
    const body = new URLSearchParams({
      'ctl00$smMain': asyncTarget,
      ...fields,
      __EVENTTARGET: '',
      __EVENTARGUMENT: '',
      __VIEWSTATEGENERATOR: session.viewStateGenerator,
      __VIEWSTATE: session.viewState,
      __EVENTVALIDATION: session.eventValidation,
      __ASYNCPOST: 'true',
      [submitField]: submitValue,
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        Accept: '*/*',
        'Accept-Language': 'es-DO,es;q=0.9',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Origin: 'https://dgii.gov.do',
        Referer: url,
        'Cache-Control': 'no-cache',
        ...(session.cookie ? { Cookie: session.cookie } : {}),
      },
      body: body.toString(),
      signal: AbortSignal.timeout(12_000),
    });

    const raw = await res.text();
    // La respuesta de ASP.NET AJAX viene envuelta en un formato pipe-delimited
    // (largo|tipo|id|contenido|...). Se recorta desde el primer '<' hasta el
    // último '>' para quedarse solo con el HTML/fragmentos embebidos.
    const start = raw.indexOf('<');
    const end = raw.lastIndexOf('>');
    return start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
  }

  private extractHidden(html: string, name: string): string {
    const re = new RegExp(`id=["']${name}["'][^>]*value=["']([^"']*)["']`, 'i');
    return html.match(re)?.[1] ?? '';
  }

  private extractCookie(headers: Headers): string {
    const anyHeaders = headers as unknown as { getSetCookie?: () => string[] };
    const cookies: string[] =
      typeof anyHeaders.getSetCookie === 'function'
        ? anyHeaders.getSetCookie()
        : headers.get('set-cookie')
          ? [headers.get('set-cookie') as string]
          : [];
    return cookies.map((c) => c.split(';')[0]).join('; ');
  }

  // ── Parseo de HTML ────────────────────────────────────────────────────────────

  private decodeEntities(s: string): string {
    return s
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&');
  }

  private stripTags(html: string): string {
    return this.decodeEntities(html.replace(/<[^>]+>/g, '')).trim();
  }

  /** Extrae pares label→valor de bloques <td>Label</td><td>Valor</td>. */
  private extractLabelValueTable(html: string): Record<string, string> {
    const result: Record<string, string> = {};
    const rowRe = /<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi;
    let m: RegExpExecArray | null;
    while ((m = rowRe.exec(html)) !== null) {
      const key = this.stripTags(m[1]).toLowerCase();
      const val = this.stripTags(m[2]);
      if (key) result[key] = val;
    }
    return result;
  }

  private getField(map: Record<string, string>, ...keys: string[]): string {
    for (const k of keys) {
      const v = map[k.toLowerCase()];
      if (v) return v;
    }
    return '';
  }

  private extractSpan(html: string, id: string): string {
    const re = new RegExp(`id=["']${id}["'][^>]*>([^<]*)<`, 'i');
    return this.stripTags(html.match(re)?.[1] ?? '');
  }

  private hasElement(html: string, id: string): boolean {
    return new RegExp(`id=["']${id}["']`, 'i').test(html);
  }
}
