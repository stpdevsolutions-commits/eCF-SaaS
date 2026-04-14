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
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { EcfService } from '../services/ecf.service';
import { CreateEcfDto } from '../dto/create-ecf.dto';
import { UpdateEcfDto } from '../dto/update-ecf.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Comprobantes Fiscales')
@Controller('api/ecf')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class EcfController {
  constructor(private ecfService: EcfService) {}

  @Post()
  @ApiOperation({ summary: 'Crear nuevo comprobante fiscal' })
  async create(@Body() dto: CreateEcfDto, @Request() req: any) {
    return await this.ecfService.create(dto, req.user.sub);
  }

  @Get()
  @ApiOperation({ summary: 'Listar comprobantes fiscales' })
  @ApiQuery({ name: 'estado', required: false })
  @ApiQuery({ name: 'rncComprador', required: false })
  async findAll(
    @Request() req: any,
    @Query('estado') estado?: string,
    @Query('rncComprador') rncComprador?: string,
  ) {
    return await this.ecfService.findAll(req.user.sub, {
      estado,
      rncComprador,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener comprobante por ID' })
  async findOne(@Param('id') id: string, @Request() req: any) {
    return await this.ecfService.findOne(id, req.user.sub);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar comprobante' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateEcfDto,
    @Request() req: any,
  ) {
    return await this.ecfService.update(id, dto, req.user.sub);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar comprobante' })
  async remove(@Param('id') id: string, @Request() req: any) {
    return await this.ecfService.remove(id, req.user.sub);
  }

  @Post(':id/validate')
  @ApiOperation({ summary: 'Validar comprobante con XSD' })
  async validate(@Param('id') id: string, @Request() req: any) {
    return await this.ecfService.validateEcf(id, req.user.sub);
  }

  @Post(':id/sign')
  @ApiOperation({ summary: 'Firmar comprobante' })
  async sign(@Param('id') id: string, @Request() req: any) {
    return await this.ecfService.signEcf(id, req.user.sub);
  }
}
