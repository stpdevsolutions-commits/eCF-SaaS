import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SenderReceiver, NoReceivedCode, ReceivedStatus } from 'dgii-ecf';
import { EcfRecibido } from '../ecf/entities/ecf-recibido.entity';
import { Ecf } from '../ecf/entities/ecf.entity';
import { Empresa } from '../empresa/entities/empresa.entity';
import { EcfSigningService } from '../ecf/services/ecf-signing.service';

/**
 * Lado receptor del modelo Emisor-Receptor Electrónicos (Informe Técnico
 * e-CF v1.0, sección 8): procesa lo que llega a las dos URL que STP debe
 * registrar en "Mantenimiento Directorio FE" (Oficina Virtual) — Recepción
 * e-CF y Aprobación Comercial — necesarias para el Set de Pruebas de
 * certificación de eCF-SaaS como software facturador (Pasos 9-11 del
 * Proceso de Certificación).
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

  // Se tipa `doc` como `any` porque es el DOM Document que devuelve
  // dgii-ecf (SenderReceiver.simpleXMLParseBody) — el proyecto no incluye
  // la lib "dom" de TypeScript (es un backend, tsconfig usa solo ES2021).
  private async generarYFirmarAcuse(
    doc: any,
    rncReceptor: string,
    estado: ReceivedStatus,
    codigo?: NoReceivedCode,
  ): Promise<string> {
    const xmlSinFirmar = this.senderReceiver.getECFDataFromXML(doc, rncReceptor, estado, codigo);
    return this.signingService.signXml(xmlSinFirmar, 'ARECF');
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
}
