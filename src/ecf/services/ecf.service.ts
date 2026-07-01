import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ecf } from '../entities/ecf.entity';
import { LineaEcf } from '../entities/linea-ecf.entity';
import { CreateEcfDto } from '../dto/create-ecf.dto';
import { UpdateEcfDto } from '../dto/update-ecf.dto';
import { XsdValidatorService } from '../../validation/xsd-validator.service';
import { EcfXmlService } from './ecf-xml.service';
import { EcfSigningService } from './ecf-signing.service';

@Injectable()
export class EcfService {
  constructor(
    @InjectRepository(Ecf)
    private ecfRepository: Repository<Ecf>,
    @InjectRepository(LineaEcf)
    private lineaRepository: Repository<LineaEcf>,
    private validatorService: XsdValidatorService,
    private xmlService: EcfXmlService,
    private signingService: EcfSigningService,
  ) {}

  async create(dto: CreateEcfDto, usuarioId: string) {
    const validation = this.validatorService.validateEcf(dto as any);

    if (!validation.valid) {
      throw new BadRequestException(`Validación fallida: ${validation.errors.join(', ')}`);
    }

    let montoTotal = 0;
    let montoITBIS = 0;
    let montoItbisRetenido = 0;
    let montoRentaRetenido = 0;

    const lineas = dto.lineas.map((linea, index) => {
      const { subtotal, itbis, total } = this.validatorService.calculateLineTotal(
        linea.cantidad,
        linea.precioUnitario,
        linea.descuentoLinea || 0,
      );

      montoTotal += total;
      montoITBIS += itbis;
      montoItbisRetenido += linea.montoItbisRetenido || 0;
      montoRentaRetenido += linea.montoIsrRetenido || 0;

      return {
        numero: index + 1,
        ...linea,
        subtotal,
        itbis,
      };
    });

    const ecf = this.ecfRepository.create({
      tipoEcf: dto.tipoEcf,
      version: 'v1.0',
      fechaEmision: new Date(),
      rncEmisor: dto.rncEmisor,
      nombreEmisor: dto.nombreEmisor,
      rncComprador: dto.rncComprador,
      nombreComprador: dto.nombreComprador,
      montoTotal,
      montoDescuento: 0,
      montoITBIS,
      montoItbisRetenido,
      montoRentaRetenido,
      moneda: dto.moneda || 'RD',
      estado: 'draft',
      usuario: { id: usuarioId } as any,
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

  async findAll(usuarioId: string, filters?: { estado?: string; rncComprador?: string }) {
    let query = this.ecfRepository
      .createQueryBuilder('ecf')
      .where('ecf.usuario_id = :usuarioId', { usuarioId })
      .leftJoinAndSelect('ecf.lineas', 'lineas');

    if (filters?.estado) {
      query = query.andWhere('ecf.estado = :estado', { estado: filters.estado });
    }

    if (filters?.rncComprador) {
      query = query.andWhere('ecf.rncComprador = :rncComprador', {
        rncComprador: filters.rncComprador,
      });
    }

    return await query.orderBy('ecf.createdAt', 'DESC').getMany();
  }

  async findOne(id: string, usuarioId: string) {
    const ecf = await this.ecfRepository.findOne({
      where: { id, usuario: { id: usuarioId } },
      relations: ['lineas'],
    });

    if (!ecf) {
      throw new NotFoundException('Comprobante no encontrado');
    }

    return ecf;
  }

  async update(id: string, dto: UpdateEcfDto, usuarioId: string) {
    const ecf = await this.findOne(id, usuarioId);

    if (ecf.estado !== 'draft') {
      throw new UnauthorizedException('Solo se pueden editar comprobantes en borrador');
    }

    Object.assign(ecf, dto);
    return await this.ecfRepository.save(ecf);
  }

  async remove(id: string, usuarioId: string) {
    const ecf = await this.findOne(id, usuarioId);

    if (ecf.estado !== 'draft') {
      throw new UnauthorizedException('Solo se pueden eliminar comprobantes en borrador');
    }

    await this.lineaRepository.delete({ ecf: { id } });
    await this.ecfRepository.remove(ecf);

    return { message: 'Comprobante eliminado exitosamente' };
  }

  // ── Validación ──────────────────────────────────────────────────────────────

  async validateEcf(id: string, usuarioId: string) {
    const ecf = await this.findOne(id, usuarioId);

    if (!['draft', 'validated'].includes(ecf.estado)) {
      throw new BadRequestException(
        `Solo se pueden validar comprobantes en estado draft o validated (estado actual: ${ecf.estado})`,
      );
    }

    const xml = this.xmlService.generateXml(ecf);
    const result = this.validatorService.validateXmlStructure(xml, ecf.tipoEcf);

    ecf.xmlValidacion = xml;
    ecf.estado = result.valid ? 'validated' : 'draft';
    await this.ecfRepository.save(ecf);

    return { ...result, estado: ecf.estado, xmlGenerado: xml };
  }

  // ── Reportes ────────────────────────────────────────────────────────────────

  private queryConFiltros(
    usuarioId: string,
    filters?: { desde?: string; hasta?: string; estado?: string },
  ) {
    const query = this.ecfRepository
      .createQueryBuilder('ecf')
      .where('ecf.usuario_id = :usuarioId', { usuarioId });

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
    usuarioId: string,
    filters?: { desde?: string; hasta?: string; estado?: string },
  ) {
    const comprobantes = await this.queryConFiltros(usuarioId, filters).getMany();

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
    usuarioId: string,
    filters?: { desde?: string; hasta?: string; estado?: string },
  ): Promise<string> {
    const comprobantes = await this.queryConFiltros(usuarioId, filters)
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

  async signEcf(id: string, usuarioId: string) {
    const ecf = await this.findOne(id, usuarioId);

    if (!['draft', 'validated'].includes(ecf.estado)) {
      throw new BadRequestException(
        `Solo se pueden firmar comprobantes en estado draft o validated (estado actual: ${ecf.estado})`,
      );
    }

    // Reutilizar XML validado o generar uno nuevo
    const xmlSinFirmar = ecf.xmlValidacion ?? this.xmlService.generateXml(ecf);

    // Validar estructura antes de firmar
    const validation = this.validatorService.validateXmlStructure(xmlSinFirmar, ecf.tipoEcf);
    if (!validation.valid) {
      throw new BadRequestException(
        `El XML no es válido, corrija antes de firmar: ${validation.errors.join('; ')}`,
      );
    }

    // Firmar con XMLDSig (RSA-2048 / SHA-256 / C14N / X509Certificate)
    const xmlFirmado = this.signingService.signXml(xmlSinFirmar);

    ecf.xmlFirmado = xmlFirmado;
    ecf.estado = 'signed';
    await this.ecfRepository.save(ecf);

    return {
      id: ecf.id,
      estado: ecf.estado,
      xmlFirmado,
      mensaje: 'Comprobante firmado exitosamente con XMLDSig (RSA-2048 / SHA-256)',
      advertencias: validation.warnings,
    };
  }
}
