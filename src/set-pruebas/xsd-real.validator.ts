import { readFileSync } from 'fs';
import { join } from 'path';
import { SCHEMA_BASEPATH } from '../ecf/services/ecf-xml.service';

/**
 * Validación REAL contra los XSD oficiales de la DGII (src/validation/schemas)
 * usando libxml2 compilado a WebAssembly (`xmllint-wasm`): sin binarios
 * nativos ni llamadas de red. Complementa a XsdValidatorService, que solo
 * valida estructura mínima.
 *
 * Los XSD de la DGII traen un defecto: el tipo `IndicadorServicioTodoIncluidoType`
 * se declara con un espacio inicial (`name=" IndicadorServicioTodoIncluidoType"`),
 * que libxml2 no tolera (.NET sí). Se normalizan los espacios dentro de los
 * atributos name/type/ref/base en memoria; los archivos del repo no se tocan.
 */
export class XsdRealValidator {
  private readonly cache = new Map<number, string>();

  constructor(private readonly basePath: string = join(process.cwd(), SCHEMA_BASEPATH)) {}

  /** Devuelve los errores del XSD del tipo dado (lista vacía = válido). Lanza si no se puede cargar el XSD. */
  async validar(xml: string, tipo: number): Promise<string[]> {
    // Import dinámico: el módulo es ESM/WASM y solo se carga si se usa.
    const { validateXML } = await import('xmllint-wasm');
    const resultado = await validateXML({
      xml: [{ fileName: 'ecf.xml', contents: xml }],
      schema: [{ fileName: `e-CF_${tipo}.xsd`, contents: this.cargarXsd(tipo) }],
    });
    if (resultado.valid) return [];
    return resultado.errors.map((e) => e.message.replace(/^Schemas validity error : /, ''));
  }

  private cargarXsd(tipo: number): string {
    let xsd = this.cache.get(tipo);
    if (!xsd) {
      xsd = readFileSync(join(this.basePath, `e-CF_${tipo}_v_1_0.xsd`), 'utf-8')
        .replace(/\b(name|type|ref|base)="\s+/g, '$1="')
        .replace(/\b(name|type|ref|base)="([^"\s]+)\s+"/g, '$1="$2"');
      this.cache.set(tipo, xsd);
    }
    return xsd;
  }
}
