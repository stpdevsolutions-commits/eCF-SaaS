import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SenderReceiver, NoReceivedCode, ReceivedStatus } from 'dgii-ecf';
import { EcfRecibido } from '../ecf/entities/ecf-recibido.entity';
import { Ecf } from '../ecf/entities/ecf.entity';
import { Empresa } from '../empresa/entities/empresa.entity';
import { EcfSigningService } from '../ecf/services/ecf-signing.service';
import { DgiiService } from './dgii.service';
import { verificarFirmaXml } from './verificar-firma-xml';

/**
 * Lado receptor del modelo Emisor-Receptor Electrónicos (Informe Técnico
 * e-CF v1.0, sección 8): procesa lo que llega a las dos URL que STP debe
 * registrar en "Mantenimiento Directorio FE" (Oficina Virtual) — Recepción
 * e-CF y Aprobación Comercial — necesarias para el Set de Pruebas de
 * certificación de eCF-SaaS como software facturador (Pasos 9-11 del
 * Proceso de Certificación). También maneja el lado inverso: cuando STP
 * (como comprador) decide aprobar o rechazar un e-CF que recibió.
 *
 * La "URL Autenticación" del mismo directorio es OPCIONAL según la DGII
 * ("solo se usaría en caso de que el emisor requiera que el receptor se
 * autentique") — no se implementa en esta primera versión.
 */
@Injectable()
export class DgiiReceptorService {
  private readonly logger = new Logger(DgiiReceptorService.name);
  private readonly senderReceiver = new SenderReceiver();

  constructor(
    @InjectRepository(EcfRecibido)
    private ecfRecibidoRepository: Repository<EcfRecibido>,
    @InjectRepository(Ecf)
    private ecfRepository: Repository<Ecf>,
    @InjectRepository(Empresa)
    private empresaRepository: Repository<Empresa>,
    private signingService: EcfSigningService,
    private dgiiService: DgiiService,
  ) {}

  /**
   * Procesa un e-CF recibido de un tercero (rol receptor): valida, guarda y
   * genera + firma el Acuse de Recibo (ARECF) que se devuelve como
   * respuesta HTTP — el Acuse solo confirma recepción, no implica
   * aprobación (ver Formato Acuse de Recibo v1.0, sección 1).
   */
  async procesarRecepcion(xmlContent: string): Promise<string> {
    const doc = this.senderReceiver.simpleXMLParseBody(xmlContent);

    const rncEmisor = this.textoDe(doc, 'RNCEmisor');
    const rncCompradorXml = this.textoDe(doc, 'RNCComprador');
    const encf = this.textoDe(doc, 'eNCF');

    if (!rncEmisor || !encf) {
      throw new BadRequestException('El XML recibido no tiene RNCEmisor o eNCF');
    }

    const rncReceptor = await this.resolverRncReceptor();

    // RNC Comprador no corresponde: el e-CF viene dirigido a otro contribuyente.
    if (rncCompradorXml && rncCompradorXml !== rncReceptor) {
      return this.generarYFirmarAcuse(
        doc,
        rncReceptor,
        ReceivedStatus['e-CF No Recibido'],
        NoReceivedCode['RNC Comprador no corresponde'],
      );
    }

    // Envío duplicado: mismo emisor + eNCF ya procesado antes.
    const yaRecibido = await this.ecfRecibidoRepository.findOne({ where: { rncEmisor, encf } });
    if (yaRecibido) {
      return this.generarYFirmarAcuse(
        doc,
        rncReceptor,
        ReceivedStatus['e-CF No Recibido'],
        NoReceivedCode['Envío duplicado'],
      );
    }

    // Firma digital inválida: el XML fue alterado o el certificado embebido
    // no corresponde a la firma (ver verificar-firma-xml.ts — valida
    // integridad/consistencia, no la cadena de confianza PSC).
    if (!verificarFirmaXml(xmlContent)) {
      return this.generarYFirmarAcuse(
        doc,
        rncReceptor,
        ReceivedStatus['e-CF No Recibido'],
        NoReceivedCode['Error de Firma Digital'],
      );
    }

    const xmlAcuseFirmado = await this.generarYFirmarAcuse(
      doc,
      rncReceptor,
      ReceivedStatus['e-CF Recibido'],
    );

    const registro = this.ecfRecibidoRepository.create({
      rncEmisor,
      rncComprador: rncReceptor,
      encf,
      tipoEcf: this.numeroDe(doc, 'TipoeCF'),
      fechaEmision: this.fechaDe(doc, 'FechaEmision'),
      montoTotal: this.numeroDe(doc, 'MontoTotal'),
      xmlRecibido: xmlContent,
      estadoAcuse: 'recibido',
      xmlAcuseFirmado,
      fechaHoraAcuse: new Date(),
    });
    await this.ecfRecibidoRepository.save(registro);

    this.logger.log(`e-CF recibido de ${rncEmisor} (${encf}) — acuse generado`);
    return xmlAcuseFirmado;
  }

  /**
   * Procesa la Aprobación o Rechazo Comercial (ACECF) que la DGII reenvía a
   * la "URL Aprobación Comercial" sobre un e-CF que STP emitió, y actualiza
   * el registro correspondiente (Ecf.aprobacionComercial).
   */
  async procesarAprobacionComercial(xmlContent: string): Promise<void> {
    const doc = this.senderReceiver.simpleXMLParseBody(xmlContent);

    const encf = this.textoDe(doc, 'eNCF');
    const estadoCodigo = this.textoDe(doc, 'Estado'); // 1: e-CF Aceptado, 2: e-CF Rechazado
    const detalleMotivoRechazo = this.textoDe(doc, 'DetalleMotivoRechazo');

    if (!encf) {
      throw new BadRequestException('El XML de aprobación comercial no tiene eNCF');
    }

    const ecf = await this.ecfRepository.findOne({ where: { encf } });
    if (!ecf) {
      this.logger.warn(`Aprobación comercial recibida para eNCF desconocido: ${encf}`);
      return;
    }

    ecf.aprobacionComercial = estadoCodigo === '2' ? 'rechazado' : 'aceptado';
    ecf.detalleMotivoRechazoAprobacion = detalleMotivoRechazo || undefined;
    ecf.fechaHoraAprobacionComercial = new Date();
    await this.ecfRepository.save(ecf);

    this.logger.log(`Aprobación comercial de ${encf}: ${ecf.aprobacionComercial}`);
  }

  /** Lista los e-CF recibidos de terceros (rol receptor), más recientes primero. */
  async listar(): Promise<EcfRecibido[]> {
    return this.ecfRecibidoRepository.find({ order: { createdAt: 'DESC' } });
  }

  async obtener(id: string): Promise<EcfRecibido> {
    const recibido = await this.ecfRecibidoRepository.findOne({ where: { id } });
    if (!recibido) {
      throw new NotFoundException('e-CF recibido no encontrado');
    }
    return recibido;
  }

  /**
   * STP, como comprador, aprueba o rechaza un e-CF que recibió: arma y firma
   * el XML de Aprobación o Rechazo Comercial (ACECF) y lo envía a la DGII
   * (Formato Aprobación Comercial v1.0 / Informe Técnico e-CF v1.0, sección
   * 4.4). Solo se puede emitir una vez por e-CF recibido.
   */
  async emitirAprobacionComercial(
    ecfRecibidoId: string,
    estado: 'aceptado' | 'rechazado',
    detalleMotivoRechazo?: string,
  ): Promise<EcfRecibido> {
    const recibido = await this.obtener(ecfRecibidoId);
    if (recibido.aprobacionComercial !== 'pendiente') {
      throw new BadRequestException('Este e-CF recibido ya tiene una aprobación comercial registrada');
    }
    if (estado === 'rechazado' && !detalleMotivoRechazo) {
      throw new BadRequestException('El rechazo comercial requiere detalleMotivoRechazo');
    }

    const codigoEstado = estado === 'rechazado' ? '2' : '1';
    const xmlSinFirmar = this.construirAcecfXml({
      rncEmisor: recibido.rncEmisor,
      encf: recibido.encf,
      fechaEmision: this.formatoFechaDgii(recibido.fechaEmision ?? recibido.createdAt),
      montoTotal: Number(recibido.montoTotal ?? 0),
      rncComprador: recibido.rncComprador,
      estado: codigoEstado,
      detalleMotivoRechazo: estado === 'rechazado' ? detalleMotivoRechazo : undefined,
      fechaHoraAprobacion: this.formatoFechaHoraDgii(new Date()),
    });
    const xmlFirmado = await this.signingService.signXml(xmlSinFirmar, 'ACECF');
    const fileName = `${recibido.rncComprador}${recibido.encf}-ACECF.xml`;

    await this.dgiiService.enviarAprobacionComercial(xmlFirmado, fileName);

    recibido.aprobacionComercial = estado;
    await this.ecfRecibidoRepository.save(recibido);

    this.logger.log(`Aprobación comercial emitida por STP para ${recibido.encf}: ${estado}`);
    return recibido;
  }

  private async generarYFirmarAcuse(
    // `doc` es el DOM Document que devuelve dgii-ecf (SenderReceiver) — se
    // tipa `any` porque el proyecto no incluye la lib "dom" de TypeScript.
    doc: any,
    rncReceptor: string,
    estado: ReceivedStatus,
    codigo?: NoReceivedCode,
  ): Promise<string> {
    const xmlSinFirmar = this.senderReceiver.getECFDataFromXML(doc, rncReceptor, estado, codigo);
    return this.signingService.signXml(xmlSinFirmar, 'ARECF');
  }

  private construirAcecfXml(datos: {
    rncEmisor: string;
    encf: string;
    fechaEmision: string;
    montoTotal: number;
    rncComprador: string;
    estado: string;
    detalleMotivoRechazo?: string;
    fechaHoraAprobacion: string;
  }): string {
    const lineas = [
      '<ACECF>',
      '  <DetalleAprobacionComercial>',
      '    <Version>1.0</Version>',
      `    <RNCEmisor>${this.esc(datos.rncEmisor)}</RNCEmisor>`,
      `    <eNCF>${this.esc(datos.encf)}</eNCF>`,
      `    <FechaEmision>${datos.fechaEmision}</FechaEmision>`,
      `    <MontoTotal>${datos.montoTotal.toFixed(2)}</MontoTotal>`,
      `    <RNCComprador>${this.esc(datos.rncComprador)}</RNCComprador>`,
      `    <Estado>${datos.estado}</Estado>`,
    ];
    if (datos.detalleMotivoRechazo) {
      lineas.push(`    <DetalleMotivoRechazo>${this.esc(datos.detalleMotivoRechazo)}</DetalleMotivoRechazo>`);
    }
    lineas.push(
      `    <FechaHoraAprobacionComercial>${datos.fechaHoraAprobacion}</FechaHoraAprobacionComercial>`,
      '  </DetalleAprobacionComercial>',
      '</ACECF>',
    );
    return lineas.join('\n');
  }

  private esc(texto: string): string {
    return texto
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** RNC de la empresa con certificado real activo — el nuestro como receptor. */
  private async resolverRncReceptor(): Promise<string> {
    const empresa = await this.empresaRepository.findOne({ where: { certificadoDgii: true } });
    if (!empresa) {
      throw new BadRequestException(
        'No hay ninguna empresa con certificado DGII activo para actuar como receptor',
      );
    }
    return empresa.rnc;
  }

  private textoDe(doc: any, tag: string): string | undefined {
    return doc.getElementsByTagName(tag)[0]?.textContent?.trim() || undefined;
  }

  private numeroDe(doc: any, tag: string): number | undefined {
    const texto = this.textoDe(doc, tag);
    return texto ? Number(texto) : undefined;
  }

  /** Formato DGII de fecha: DD-MM-AAAA. */
  private fechaDe(doc: any, tag: string): Date | undefined {
    const texto = this.textoDe(doc, tag);
    if (!texto) return undefined;
    const [dd, mm, yyyy] = texto.split('-').map(Number);
    if (!dd || !mm || !yyyy) return undefined;
    return new Date(yyyy, mm - 1, dd);
  }

  private formatoFechaDgii(date: Date): string {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    return `${dd}-${mm}-${date.getFullYear()}`;
  }

  private formatoFechaHoraDgii(date: Date): string {
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${this.formatoFechaDgii(date)} ${hh}:${min}:${ss}`;
  }
}
