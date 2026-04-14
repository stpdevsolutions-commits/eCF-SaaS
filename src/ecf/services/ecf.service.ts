import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Ecf } from '../entities/ecf.entity';
import { LineaEcf } from '../entities/linea-ecf.entity';
import { CreateEcfDto } from '../dto/create-ecf.dto';
import { UpdateEcfDto } from '../dto/update-ecf.dto';
import { XsdValidatorService } from '../../validation/xsd-validator.service';

@Injectable()
export class EcfService {
  constructor(
    @InjectRepository(Ecf)
    private ecfRepository: Repository<Ecf>,
    @InjectRepository(LineaEcf)
    private lineaRepository: Repository<LineaEcf>,
    private validatorService: XsdValidatorService,
  ) {}

  async create(dto: CreateEcfDto, usuarioId: string) {
    // Validar con XSD
    const validationResult = this.validatorService.validateEcf(
      dto.tipoEcf,
      dto,
    );

    if (!validationResult.valid) {
      throw new BadRequestException({
        message: 'Validación XSD fallida',
        errors: validationResult.errors,
      });
    }

    // Calcular montos
    const montoTotal = dto.lineas.reduce(
      (sum, l) => sum + l.cantidad * l.precioUnitario - (l.descuentoLinea || 0),
      0,
    );

    const montoITBIS = montoTotal * 0.18; // 18% ITBIS RD
    const montoGrandTotal = montoTotal + montoITBIS;

    // Crear ECF
    const ecf = this.ecfRepository.create({
      tipoEcf: dto.tipoEcf,
      version: dto.version || 'v1.0',
      fechaEmision: new Date(),
      rncEmisor: dto.rncEmisor,
      nombreEmisor: dto.nombreEmisor,
      rncComprador: dto.rncComprador,
      nombreComprador: dto.nombreComprador,
      montoTotal: montoGrandTotal,
      montoDescuento: dto.lineas.reduce((sum, l) => sum + (l.descuentoLinea || 0), 0),
      montoITBIS,
      moneda: dto.moneda || 'RD',
      estado: 'draft',
      usuario: { id: usuarioId } as any,
    });

    const savedEcf = await this.ecfRepository.save(ecf);

    // Crear líneas
    const lineas = dto.lineas.map((linea, index) => {
      const subtotal = linea.cantidad * linea.precioUnitario - (linea.descuentoLinea || 0);
      const itbis = subtotal * 0.18;

      return this.lineaRepository.create({
        numero: index + 1,
        descripcion: linea.descripcion,
        cantidad: linea.cantidad,
        precioUnitario: linea.precioUnitario,
        descuentoLinea: linea.descuentoLinea || 0,
        subtotal,
        itbis,
        ecf: savedEcf,
      });
    });

    await this.lineaRepository.save(lineas);
    savedEcf.lineas = lineas;

    return savedEcf;
  }

  async findAll(usuarioId: string, filters?: any) {
    const query = this.ecfRepository.createQueryBuilder('ecf')
      .where('ecf.usuario_id = :usuarioId', { usuarioId })
      .leftJoinAndSelect('ecf.lineas', 'lineas');

    if (filters?.estado) {
      query.andWhere('ecf.estado = :estado', { estado: filters.estado });
    }

    if (filters?.desde && filters?.hasta) {
      query.andWhere('ecf.fechaEmision BETWEEN :desde AND :hasta', {
        desde: filters.desde,
        hasta: filters.hasta,
      });
    }

    if (filters?.rncComprador) {
      query.andWhere('ecf.rncComprador LIKE :rnc', {
        rnc: `%${filters.rncComprador}%`,
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
      throw new NotFoundException('ECF no encontrado');
    }

    return ecf;
  }

  async update(id: string, dto: UpdateEcfDto, usuarioId: string) {
    const ecf = await this.findOne(id, usuarioId);

    if (ecf.estado !== 'draft') {
      throw new BadRequestException('Solo se pueden editar ECFs en borrador');
    }

    // Actualizar campos permitidos
    if (dto.nombreComprador) ecf.nombreComprador = dto.nombreComprador;
    if (dto.rncComprador) ecf.rncComprador = dto.rncComprador;
    if (dto.moneda) ecf.moneda = dto.moneda;

    return await this.ecfRepository.save(ecf);
  }

  async remove(id: string, usuarioId: string) {
    const ecf = await this.findOne(id, usuarioId);

    if (ecf.estado !== 'draft') {
      throw new BadRequestException(
        'Solo se pueden eliminar ECFs en borrador',
      );
    }

    await this.ecfRepository.remove(ecf);
    return { message: 'ECF eliminado' };
  }

  async validateEcf(id: string, usuarioId: string) {
    const ecf = await this.findOne(id, usuarioId);

    const validationResult = this.validatorService.validateEcf(
      ecf.tipoEcf,
      ecf,
    );

    if (!validationResult.valid) {
      throw new BadRequestException({
        message: 'Validación fallida',
        errors: validationResult.errors,
      });
    }

    ecf.xmlValidacion = JSON.stringify(validationResult);
    await this.ecfRepository.save(ecf);

    return {
      message: 'ECF válido',
      valid: true,
    };
  }

  async signEcf(id: string, usuarioId: string) {
    const ecf = await this.findOne(id, usuarioId);

    if (ecf.estado !== 'draft') {
      throw new BadRequestException('Solo se pueden firmar ECFs en borrador');
    }

    // Preparar para firma (Sprint 3)
    ecf.estado = 'signed';
    await this.ecfRepository.save(ecf);

    return {
      message: 'ECF firmado correctamente',
      estado: 'signed',
    };
  }
}
