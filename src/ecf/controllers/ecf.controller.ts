import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { Response } from 'express';
import { EcfService } from '../services/ecf.service';
import { CreateEcfDto } from '../dto/create-ecf.dto';
import { UpdateEcfDto } from '../dto/update-ecf.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Comprobantes Fiscales')
@Controller('ecf')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class EcfController {
  constructor(private ecfService: EcfService) {}

  @Post()
  @ApiOperation({ summary: 'Crear nuevo comprobante fiscal' })
  async create(@Body() dto: CreateEcfDto, @Request() req: any) {
    return await this.ecfService.create(dto, req.user.id, req.user.empresaId);
  }

  @Get()
  @ApiOperation({ summary: 'Listar comprobantes fiscales' })
  @ApiQuery({ name: 'estado', required: false })
  @ApiQuery({ name: 'rncComprador', required: false })
  @ApiQuery({ name: 'tipoEcf', required: false })
  @ApiQuery({ name: 'encf', required: false, description: 'Búsqueda parcial del eNCF' })
  @ApiQuery({ name: 'fechaDesde', required: false, description: 'Fecha ISO (inclusive)' })
  @ApiQuery({ name: 'fechaHasta', required: false, description: 'Fecha ISO (inclusive)' })
  async findAll(
    @Request() req: any,
    @Query('estado') estado?: string,
    @Query('rncComprador') rncComprador?: string,
    @Query('tipoEcf') tipoEcf?: string,
    @Query('encf') encf?: string,
    @Query('fechaDesde') fechaDesde?: string,
    @Query('fechaHasta') fechaHasta?: string,
  ) {
    return await this.ecfService.findAll(req.user.empresaId, {
      estado,
      rncComprador,
      tipoEcf,
      encf,
      fechaDesde,
      fechaHasta,
    });
  }

  @Get('reportes/resumen')
  @ApiOperation({ summary: 'Resumen agregado de comprobantes (totales, por estado, por tipo)' })
  @ApiQuery({ name: 'desde', required: false, description: 'Fecha ISO (inclusive)' })
  @ApiQuery({ name: 'hasta', required: false, description: 'Fecha ISO (inclusive)' })
  @ApiQuery({ name: 'estado', required: false })
  async resumen(
    @Request() req: any,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('estado') estado?: string,
  ) {
    return await this.ecfService.getResumen(req.user.empresaId, { desde, hasta, estado });
  }

  @Get('reportes/export')
  @ApiOperation({ summary: 'Exportar comprobantes a CSV' })
  @ApiQuery({ name: 'desde', required: false, description: 'Fecha ISO (inclusive)' })
  @ApiQuery({ name: 'hasta', required: false, description: 'Fecha ISO (inclusive)' })
  @ApiQuery({ name: 'estado', required: false })
  async exportar(
    @Request() req: any,
    @Res() res: Response,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('estado') estado?: string,
  ) {
    const csv = await this.ecfService.exportCsv(req.user.empresaId, { desde, hasta, estado });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="comprobantes.csv"');
    res.send(csv);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener comprobante por ID' })
  async findOne(@Param('id') id: string, @Request() req: any) {
    return await this.ecfService.findOne(id, req.user.empresaId);
  }

  @Get(':id/xml')
  @ApiOperation({ summary: 'Descargar el XML disponible más reciente (firmado o validado)' })
  async getXml(@Param('id') id: string, @Request() req: any, @Res() res: Response) {
    const { xml, firmado } = await this.ecfService.getXml(id, req.user.empresaId);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${id}${firmado ? '-firmado' : '-validado'}.xml"`,
    );
    res.send(xml);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar comprobante' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateEcfDto,
    @Request() req: any,
  ) {
    return await this.ecfService.update(id, dto, req.user.empresaId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar comprobante' })
  async remove(@Param('id') id: string, @Request() req: any) {
    return await this.ecfService.remove(id, req.user.empresaId);
  }

  @Post(':id/validate')
  @ApiOperation({ summary: 'Validar comprobante con XSD' })
  async validate(@Param('id') id: string, @Request() req: any) {
    return await this.ecfService.validateEcf(id, req.user.empresaId);
  }

  @Post(':id/sign')
  @ApiOperation({ summary: 'Firmar comprobante' })
  async sign(@Param('id') id: string, @Request() req: any) {
    return await this.ecfService.signEcf(id, req.user.empresaId);
  }

  @Post(':id/transmit')
  @ApiOperation({ summary: 'Transmitir comprobante firmado a la DGII' })
  async transmit(@Param('id') id: string, @Request() req: any) {
    return await this.ecfService.transmitEcf(id, req.user.empresaId);
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Consultar estado del comprobante en la DGII' })
  async status(@Param('id') id: string, @Request() req: any) {
    return await this.ecfService.checkStatus(id, req.user.empresaId);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancelar comprobante transmitido en la DGII' })
  async cancel(
    @Param('id') id: string,
    @Body() body: { motivo: string },
    @Request() req: any,
  ) {
    return await this.ecfService.cancelEcf(id, req.user.empresaId, body.motivo);
  }
}
