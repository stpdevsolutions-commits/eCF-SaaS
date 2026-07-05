import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ENVIRONMENT,
  generateEcfQRCodeURL,
  generateFcQRCodeURL,
  getCodeSixDigitfromSignature,
} from 'dgii-ecf';
import { Ecf } from '../entities/ecf.entity';
import { LineaEcf } from '../entities/linea-ecf.entity';
import { Empresa } from '../../empresa/entities/empresa.entity';
import { CreateEcfDto, CreateLineaEcfDto } from '../dto/create-ecf.dto';
import { UpdateEcfDto } from '../dto/update-ecf.dto';
import { XsdValidatorService } from '../../validation/xsd-validator.service';
import { EcfXmlService, TIPO_ECF_MAP } from './ecf-xml.service';
import { EcfSigningService } from './ecf-signing.service';
import { NcfSequenceService } from './ncf-sequence.service';
import { DgiiService } from '../../dgii/dgii.service';

@Injectable()
export class EcfService {
  private readonly logger = new Logger(EcfService.name);

  constructor(
    @InjectRepository(Ecf)
    private ecfRepository: Repository<Ecf>,
    @InjectRepository(LineaEcf)
    private lineaRepository: Repository<LineaEcf>,
    @InjectRepository(Empresa)
    private empresaRepository: Repository<Empresa>,
    private validatorService: XsdValidatorService,
    private xmlService: EcfXmlService,
    private signingService: EcfSigningService,
    private ncfSequenceService: NcfSequenceService,
    private dgiiService: DgiiService,
    private configService: ConfigService,
  ) {}

  /**
   * Calcula líneas + totales (incluida la Propina Legal opcional) a partir
   * del DTO. Compartido entre create() y update() para no duplicar la lógica.
   */
  /** IndicadorFacturacion (XSD) -> tasa de ITBIS aplicada a la línea. */
  private static readonly TASA_POR_INDICADOR: Record<number, number> = {
    1: 0.18, // ITBIS 1 (18%)
    2: 0.16, // ITBIS 2 (16%)
    3: 0, // ITBIS 3 (0%)
    4: 0, // Exento
  };

  private calcularLineasYTotales(lineasDto: CreateLineaEcfDto[], aplicaPropinaLegal: boolean) {
    let montoTotal = 0;
    let montoITBIS = 0;
    let montoItbisRetenido = 0;
    let montoRentaRetenido = 0;

    const lineas = lineasDto.map((linea, index) => {
      const indicadorFacturacion = linea.indicadorFacturacion ?? 1;
      const tasaItbis = EcfService.TASA_POR_INDICADOR[indicadorFacturacion] ?? 0.18;
      const { subtotal, itbis, total } = this.validatorService.calculateLineTotal(
        linea.cantidad,
        linea.precioUnitario,
        linea.descuentoLinea || 0,
        tasaItbis,
      );

      montoTotal += total;
      montoITBIS += itbis;
      montoItbisRetenido += linea.montoItbisRetenido || 0;
      montoRentaRetenido += linea.montoIsrRetenido || 0;

      return {
        numero: index + 1,
        ...linea,
        indicadorBienoServicio: linea.indicadorBienoServicio ?? 1,
        indicadorFacturacion,
        subtotal,
        itbis,
      };
    });

    // Propina Legal (10%, impuesto adicional código 001): se calcula sobre el
    // subtotal gravado (antes de ITBIS) de todas las líneas y se suma al total.
    let montoPropinaLegal = 0;
    if (aplicaPropinaLegal) {
      const subtotalGravado = montoTotal - montoITBIS;
      montoPropinaLegal = Math.round(subtotalGravado * 0.1 * 100) / 100;
      montoTotal += montoPropinaLegal;
    }

    return { lineas, montoTotal, montoITBIS, montoItbisRetenido, montoRentaRetenido, montoPropinaLegal };
  }

  /**
   * Crea un e-CF a nombre de la empresa (scoping) registrando además el
   * usuario que lo creó (`usuario_id` = "creado por"). Los datos del emisor
   * (RNC, razón social, dirección) se toman de la Empresa, no del DTO.
   */
  async create(dto: CreateEcfDto, usuarioId: string, empresaId: string) {
    const empresa = await this.empresaRepository.findOne({ where: { id: empresaId } });
    if (!empresa) {
      throw new NotFoundException('Empresa no encontrada');
    }

    const validation = this.validatorService.validateEcf({
      ...dto,
      rncEmisor: empresa.rnc,
      nombreEmisor: empresa.razonSocial,
    });

    if (!validation.valid) {
      throw new BadRequestException(`Validación fallida: ${validation.errors.join(', ')}`);
    }

    const { lineas, montoTotal, montoITBIS, montoItbisRetenido, montoRentaRetenido, montoPropinaLegal } =
      this.calcularLineasYTotales(dto.lineas, dto.aplicaPropinaLegal ?? false);

    const ecf = this.ecfRepository.create({
      tipoEcf: dto.tipoEcf,
      version: 'v1.0',
      fechaEmision: dto.fechaEmision ? new Date(dto.fechaEmision) : new Date(),
      rncEmisor: empresa.rnc,
      nombreEmisor: empresa.razonSocial,
      direccionEmisor: empresa.direccion,
      tipoPago: dto.tipoPago ?? 1,
      tipoIngresos: dto.tipoIngresos ?? '01',
      terminoPago: dto.terminoPago,
      rncComprador: dto.rncComprador,
      idExtranjeroComprador: dto.idExtranjeroComprador,
      nombreComprador: dto.nombreComprador,
      telefonoComprador: dto.telefonoComprador,
      correoComprador: dto.correoComprador,
      direccionComprador: dto.direccionComprador,
      provinciaComprador: dto.provinciaComprador,
      municipioComprador: dto.municipioComprador,
      comentarioComprador: dto.comentarioComprador,
      montoTotal,
      montoDescuento: 0,
      montoITBIS,
      montoItbisRetenido,
      montoRentaRetenido,
      aplicaPropinaLegal: dto.aplicaPropinaLegal ?? false,
      montoPropinaLegal,
      moneda: dto.moneda || 'RD',
      estado: 'draft',
      usuario: { id: usuarioId } as any,
      empresaId,
    });

    const ecfGuardado = await this.ecfRepository.save(ecf);

    for (const linea of lineas) {
      const lineaEntity = this.lineaRepository.create({
        ...linea,
        ecf: ecfGuardado,
      });
      await this.lineaRepository.save(lineaEntity);
    }

    return { ...ecfGuardado, lineas };
  }

  async findAll(
    empresaId: string,
    filters?: {
      estado?: string;
      rncComprador?: string;
      tipoEcf?: string;
      encf?: string;
      fechaDesde?: string;
      fechaHasta?: string;
    },
  ) {
    let query = this.ecfRepository
      .createQueryBuilder('ecf')
      .where('ecf.empresa_id = :empresaId', { empresaId })
      .leftJoinAndSelect('ecf.lineas', 'lineas');

    if (filters?.estado) {
      query = query.andWhere('ecf.estado = :estado', { estado: filters.estado });
    }

    if (filters?.rncComprador) {
      query = query.andWhere('ecf.rncComprador = :rncComprador', {
        rncComprador: filters.rncComprador,
      });
    }

    if (filters?.tipoEcf) {
      query = query.andWhere('ecf.tipoEcf = :tipoEcf', { tipoEcf: filters.tipoEcf });
    }

    if (filters?.encf) {
      query = query.andWhere('ecf.encf ILIKE :encf', { encf: `%${filters.encf}%` });
    }

    if (filters?.fechaDesde) {
      query = query.andWhere('ecf.fechaEmision >= :fechaDesde', { fechaDesde: filters.fechaDesde });
    }

    if (filters?.fechaHasta) {
      query = query.andWhere('ecf.fechaEmision <= :fechaHasta', { fechaHasta: filters.fechaHasta });
    }

    return await query.orderBy('ecf.createdAt', 'DESC').getMany();
  }

  /** Devuelve el XML disponible más reciente (firmado si existe, si no el validado). */
  async getXml(id: string, empresaId: string): Promise<{ xml: string; firmado: boolean }> {
    const ecf = await this.findOne(id, empresaId);

    if (ecf.xmlFirmado) {
      return { xml: ecf.xmlFirmado, firmado: true };
    }
    if (ecf.xmlValidacion) {
      return { xml: ecf.xmlValidacion, firmado: false };
    }

    throw new BadRequestException(
      'Este comprobante aún no tiene un XML generado — valídalo o fírmalo primero.',
    );
  }

  async findOne(id: string, empresaId: string) {
    const ecf = await this.ecfRepository.findOne({
      where: { id, empresaId },
      relations: ['lineas'],
    });

    if (!ecf) {
      throw new NotFoundException('Comprobante no encontrado');
    }

    return ecf;
  }

  async update(id: string, dto: UpdateEcfDto, empresaId: string) {
    const ecf = await this.findOne(id, empresaId);

    if (ecf.estado !== 'draft') {
      throw new UnauthorizedException('Solo se pueden editar comprobantes en borrador');
    }

    const { lineas, ...camposEcf } = dto;
    Object.assign(ecf, camposEcf);

    if (lineas) {
      const { lineas: lineasCalculadas, montoTotal, montoITBIS, montoItbisRetenido, montoRentaRetenido, montoPropinaLegal } =
        this.calcularLineasYTotales(lineas, dto.aplicaPropinaLegal ?? ecf.aplicaPropinaLegal);

      await this.lineaRepository.delete({ ecf: { id: ecf.id } });

      ecf.montoTotal = montoTotal;
      ecf.montoITBIS = montoITBIS;
      ecf.montoItbisRetenido = montoItbisRetenido;
      ecf.montoRentaRetenido = montoRentaRetenido;
      ecf.montoPropinaLegal = montoPropinaLegal;

      for (const linea of lineasCalculadas) {
        const lineaEntity = this.lineaRepository.create({ ...linea, ecf });
        await this.lineaRepository.save(lineaEntity);
      }

      // `ecf.lineas` todavía tiene el array ANTERIOR (cargado por findOne antes
      // del delete+create de arriba). Como la relación tiene cascade:true, un
      // save(ecf) con ese array obsoleto reinsertaría las líneas viejas. Se
      // limpia para que el cascade no toque linea_ecf (ya lo gestionamos a mano).
      ecf.lineas = undefined;
    }

    // El XML validado queda obsoleto tras cualquier edición — se regenera en la próxima validación.
    ecf.xmlValidacion = undefined;

    const ecfGuardado = await this.ecfRepository.save(ecf);
    return await this.findOne(ecfGuardado.id, empresaId);
  }

  async remove(id: string, empresaId: string) {
    const ecf = await this.findOne(id, empresaId);

    if (ecf.estado !== 'draft') {
      throw new UnauthorizedException('Solo se pueden eliminar comprobantes en borrador');
    }

    await this.lineaRepository.delete({ ecf: { id } });
    await this.ecfRepository.remove(ecf);

    return { message: 'Comprobante eliminado exitosamente' };
  }

  // ── Secuencia eNCF ──────────────────────────────────────────────────────────

  /**
   * Garantiza que el ECF tenga un eNCF asignado. La secuencia se consume UNA
   * sola vez: si el ECF ya tiene `encf` (asignado en una validación previa),
   * se reutiliza y NO se incrementa el contador.
   */
  private async asignarEncf(ecf: Ecf, empresaId: string): Promise<void> {
    if (ecf.encf) {
      return;
    }
    const secuencia = await this.ncfSequenceService.nextSequence(
      empresaId,
      ecf.tipoEcf,
    );
    ecf.encf = this.xmlService.buildEncf(ecf.tipoEcf, secuencia);
  }

  // ── Validación ──────────────────────────────────────────────────────────────

  async validateEcf(id: string, empresaId: string) {
    const ecf = await this.findOne(id, empresaId);

    if (!['draft', 'validated'].includes(ecf.estado)) {
      throw new BadRequestException(
        `Solo se pueden validar comprobantes en estado draft o validated (estado actual: ${ecf.estado})`,
      );
    }

    await this.asignarEncf(ecf, empresaId);
    const xml = this.xmlService.generateXml(ecf);
    const result = this.validatorService.validateXmlStructure(xml, ecf.tipoEcf);

    ecf.xmlValidacion = xml;
    ecf.estado = result.valid ? 'validated' : 'draft';
    await this.ecfRepository.save(ecf);

    return { ...result, estado: ecf.estado, encf: ecf.encf, xmlGenerado: xml };
  }

  // ── Reportes ────────────────────────────────────────────────────────────────

  private queryConFiltros(
    empresaId: string,
    filters?: { desde?: string; hasta?: string; estado?: string },
  ) {
    const query = this.ecfRepository
      .createQueryBuilder('ecf')
      .where('ecf.empresa_id = :empresaId', { empresaId });

    if (filters?.desde) {
      query.andWhere('ecf.fechaEmision >= :desde', { desde: filters.desde });
    }
    if (filters?.hasta) {
      query.andWhere('ecf.fechaEmision <= :hasta', { hasta: filters.hasta });
    }
    if (filters?.estado) {
      query.andWhere('ecf.estado = :estado', { estado: filters.estado });
    }

    return query;
  }

  async getResumen(
    empresaId: string,
    filters?: { desde?: string; hasta?: string; estado?: string },
  ) {
    const comprobantes = await this.queryConFiltros(empresaId, filters).getMany();

    const totales = comprobantes.reduce(
      (acc, e) => {
        acc.cantidad += 1;
        acc.montoTotal += Number(e.montoTotal);
        acc.montoITBIS += Number(e.montoITBIS);
        acc.montoItbisRetenido += Number(e.montoItbisRetenido);
        acc.montoRentaRetenido += Number(e.montoRentaRetenido);
        return acc;
      },
      { cantidad: 0, montoTotal: 0, montoITBIS: 0, montoItbisRetenido: 0, montoRentaRetenido: 0 },
    );

    const porEstado: Record<string, number> = {};
    const porTipo: Record<string, number> = {};
    for (const e of comprobantes) {
      porEstado[e.estado] = (porEstado[e.estado] ?? 0) + 1;
      porTipo[e.tipoEcf] = (porTipo[e.tipoEcf] ?? 0) + 1;
    }

    return { ...totales, porEstado, porTipo };
  }

  async exportCsv(
    empresaId: string,
    filters?: { desde?: string; hasta?: string; estado?: string },
  ): Promise<string> {
    const comprobantes = await this.queryConFiltros(empresaId, filters)
      .orderBy('ecf.fechaEmision', 'DESC')
      .getMany();

    const header = [
      'Tipo',
      'UUID DGII',
      'RNC Comprador',
      'Nombre Comprador',
      'Estado',
      'Monto Total',
      'ITBIS',
      'ITBIS Retenido',
      'ISR Retenido',
      'Fecha Emisión',
    ];

    const filas = comprobantes.map((e) => [
      e.tipoEcf,
      e.uuid ?? '',
      e.rncComprador,
      e.nombreComprador,
      e.estado,
      Number(e.montoTotal).toFixed(2),
      Number(e.montoITBIS).toFixed(2),
      Number(e.montoItbisRetenido).toFixed(2),
      Number(e.montoRentaRetenido).toFixed(2),
      e.fechaEmision.toISOString(),
    ]);

    const csvEscape = (v: string) =>
      /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

    return [header, ...filas]
      .map((fila) => fila.map((v) => csvEscape(String(v))).join(','))
      .join('\n');
  }

  // ── Firma digital ───────────────────────────────────────────────────────────

  async signEcf(id: string, empresaId: string) {
    const ecf = await this.findOne(id, empresaId);

    if (!['draft', 'validated'].includes(ecf.estado)) {
      throw new BadRequestException(
        `Solo se pueden firmar comprobantes en estado draft o validated (estado actual: ${ecf.estado})`,
      );
    }

    // Reutilizar XML validado o generar uno nuevo.
    // Si hay que regenerar, se reutiliza el eNCF ya asignado (asignarEncf solo
    // consume una secuencia nueva cuando el ECF nunca ha tenido una).
    let xmlSinFirmar = ecf.xmlValidacion;
    if (!xmlSinFirmar) {
      await this.asignarEncf(ecf, empresaId);
      xmlSinFirmar = this.xmlService.generateXml(ecf);
    }

    // Validar estructura antes de firmar
    const validation = this.validatorService.validateXmlStructure(xmlSinFirmar, ecf.tipoEcf);
    if (!validation.valid) {
      throw new BadRequestException(
        `El XML no es válido, corrija antes de firmar: ${validation.errors.join('; ')}`,
      );
    }

    // Firmar con XMLDSig (RSA-2048 / SHA-256 / C14N / X509Certificate)
    const xmlFirmado = await this.signingService.signXml(xmlSinFirmar);

    ecf.xmlFirmado = xmlFirmado;
    ecf.estado = 'signed';

    // Código de seguridad + QR de representación impresa: se derivan
    // localmente de la firma, no requieren transmisión ni credenciales DGII.
    this.asignarRepresentacionImpresa(ecf, xmlFirmado);

    await this.ecfRepository.save(ecf);

    return {
      id: ecf.id,
      estado: ecf.estado,
      encf: ecf.encf,
      xmlFirmado,
      codigoSeguridadDgii: ecf.codigoSeguridadDgii,
      qrUrl: ecf.qrUrl,
      mensaje: 'Comprobante firmado exitosamente con XMLDSig (RSA-2048 / SHA-256)',
      advertencias: validation.warnings,
    };
  }

  /**
   * Calcula el código de seguridad de 6 dígitos (primeros 6 del SignatureValue)
   * y la URL del QR de consulta de timbre para la representación impresa.
   * Ambos se derivan offline de la firma, sin depender de la DGII.
   */
  private asignarRepresentacionImpresa(ecf: Ecf, xmlFirmado: string): void {
    try {
      const codigoSeguridad = getCodeSixDigitfromSignature(xmlFirmado);
      if (!codigoSeguridad) {
        return;
      }
      ecf.codigoSeguridadDgii = codigoSeguridad;

      const environment =
        (this.configService.get<string>('DGII_ENVIRONMENT') as ENVIRONMENT) ||
        ENVIRONMENT.DEV;
      const montoTotal = Number(ecf.montoTotal);

      ecf.qrUrl =
        ecf.tipoEcf === 'e-CF_32_v_1_0'
          ? generateFcQRCodeURL(ecf.rncEmisor, ecf.encf!, montoTotal, codigoSeguridad, environment)
          : generateEcfQRCodeURL(
              ecf.rncEmisor,
              ecf.rncComprador,
              ecf.encf!,
              montoTotal.toFixed(2),
              this.toFechaDgii(ecf.fechaEmision),
              this.toFechaDgii(new Date()),
              codigoSeguridad,
              environment,
            );
    } catch (error) {
      this.logger.warn(
        `No se pudo calcular código de seguridad/QR para e-CF ${ecf.id}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  /** Formato de fecha DGII: DD-MM-YYYY (igual que EcfXmlService). */
  private toFechaDgii(date: Date): string {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  }

  // ── Transmisión a la DGII ────────────────────────────────────────────────────

  private async obtenerTokenDgii(empresaId: string): Promise<string> {
    const empresa = await this.empresaRepository.findOne({ where: { id: empresaId } });
    if (!empresa?.tokenDgii) {
      throw new BadRequestException(
        'Debes autenticarte con la DGII primero (POST /dgii/authenticate)',
      );
    }
    return empresa.tokenDgii;
  }

  async transmitEcf(id: string, empresaId: string) {
    const ecf = await this.findOne(id, empresaId);

    if (ecf.estado !== 'signed') {
      throw new BadRequestException(
        `Solo se pueden transmitir comprobantes firmados (estado actual: ${ecf.estado})`,
      );
    }

    const token = await this.obtenerTokenDgii(empresaId);
    const resultado = await this.dgiiService.transmitEcf(ecf, token);

    ecf.uuid = resultado.uuid;
    ecf.codigoSeguridadDgii = resultado.codigo;
    ecf.estado = 'transmitted';
    await this.ecfRepository.save(ecf);

    return {
      id: ecf.id,
      estado: ecf.estado,
      uuid: ecf.uuid,
      codigoSeguridadDgii: ecf.codigoSeguridadDgii,
      mensajes: resultado.mensajes,
    };
  }

  // ── Consulta de estado en la DGII ────────────────────────────────────────────

  async checkStatus(id: string, empresaId: string) {
    const ecf = await this.findOne(id, empresaId);

    if (!ecf.uuid) {
      throw new BadRequestException(
        'Este comprobante aún no ha sido transmitido a la DGII',
      );
    }

    const token = await this.obtenerTokenDgii(empresaId);
    const resultado = await this.dgiiService.queryEcfStatus(ecf.uuid, token);

    const ESTADO_DGII_A_LOCAL: Record<string, string> = {
      Aceptado: 'accepted',
      Rechazado: 'rejected',
      Cancelado: 'cancelled',
    };
    const nuevoEstado = ESTADO_DGII_A_LOCAL[resultado.estado];
    if (nuevoEstado) {
      ecf.estado = nuevoEstado;
      await this.ecfRepository.save(ecf);
    }

    return {
      id: ecf.id,
      estado: ecf.estado,
      estadoDgii: resultado.estado,
      mensaje: resultado.mensaje,
    };
  }

  // ── Cancelación en la DGII ───────────────────────────────────────────────────

  async cancelEcf(id: string, empresaId: string, motivo: string) {
    const ecf = await this.findOne(id, empresaId);

    if (!ecf.uuid) {
      throw new BadRequestException(
        'Solo se pueden cancelar comprobantes ya transmitidos a la DGII',
      );
    }
    if (ecf.estado === 'cancelled') {
      throw new BadRequestException('Este comprobante ya está cancelado');
    }

    const token = await this.obtenerTokenDgii(empresaId);

    // Datos para construir el ANECF (anulación de rangos) en modo real; en
    // modo mock DgiiService los ignora. ecf.encf siempre debe existir aquí:
    // transmitEcf exige xmlFirmado+encf antes de asignar ecf.uuid.
    const tipoEcfNumerico = TIPO_ECF_MAP[ecf.tipoEcf];
    const rango =
      ecf.encf && tipoEcfNumerico
        ? { rncEmisor: ecf.rncEmisor, tipoEcf: tipoEcfNumerico, encf: ecf.encf }
        : undefined;

    const resultado = await this.dgiiService.cancelEcf(ecf.uuid, motivo, token, rango);

    ecf.estado = 'cancelled';
    await this.ecfRepository.save(ecf);

    return {
      id: ecf.id,
      estado: ecf.estado,
      mensaje: resultado.mensaje,
    };
  }
}
