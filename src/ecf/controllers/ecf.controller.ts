import {
  Controller,
  Get,
  Post,
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
  ApiCreatedResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { EcfService } from '../services/ecf.service';
import { CreateEcfDto } from '../dto/create-ecf.dto';
import { UpdateEcfDto } from '../dto/update-ecf.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Comprobantes Fiscales Electrónicos')
@Controller('api/ecf')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class EcfController {
  constructor(private ecfService: EcfService) {}

  @Post()
  @ApiOperation({ summary: 'Crear nuevo comprobante fiscal' })
  @ApiCreatedResponse({ description: 'Comprobante creado' })
  async create(@Body() dto: CreateEcfDto, @Request() req) {
    return await this.ecfService.create(dto, req.user.sub);
  }

  @Get()
  @ApiOperation({ summary: 'Listar comprobantes con filtros' })
  @ApiOkResponse({ description: 'Listado de comprobantes' })
  async findAll(
    @Request() req,
    @Query('estado') estado?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('rncComprador') rncComprador?: string,
  ) {
    const filters = {
      estado,
      desde: desde ? new Date(desde) : undefined,
      hasta: hasta ? new Date(hasta) : undefined,
      rncComprador,
    };
    return await this.ecfService.findAll(req.user.sub, filters);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener comprobante por ID' })
  async findOne(@Param('id') id: string, @Request() req) {
    return await this.ecfService.findOne(id, req.user.sub);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar comprobante' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateEcfDto,
    @Request() req,
  ) {
    return await this.ecfService.update(id, dto, req.user.sub);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar comprobante' })
  async remove(@Param('id') id: string, @Request() req) {
    return await this.ecfService.remove(id, req.user.sub);
  }

  @Post(':id/validate')
  @ApiOperation({ summary: 'Validar comprobante' })
  async validate(@Param('id') id: string, @Request() req) {
    return await this.ecfService.validateEcf(id, req.user.sub);
  }

  @Post(':id/sign')
  @ApiOperation({ summary: 'Firmar comprobante' })
  async sign(@Param('id') id: string, @Request() req) {
    return await this.ecfService.signEcf(id, req.user.sub);
  }
}
