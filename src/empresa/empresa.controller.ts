import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
} from '@nestjs/swagger';
import { EmpresaService } from './empresa.service';
import { CreateEmpresaUserDto } from './dto/create-empresa-user.dto';
import { UpdateEmpresaDto } from './dto/update-empresa.dto';
import { SetSecuenciaDto } from './dto/set-secuencia.dto';
import { NcfSequenceService } from '../ecf/services/ncf-sequence.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

/**
 * Gestión de la empresa y sus usuarios. Solo accesible para rol 'admin',
 * salvo los endpoints que redeclaran @Roles a nivel de método (la metadata
 * del handler tiene prioridad sobre la de la clase en RolesGuard).
 */
@ApiTags('Empresa')
@Controller('empresa')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@ApiBearerAuth()
export class EmpresaController {
  constructor(
    private empresaService: EmpresaService,
    private ncfSequenceService: NcfSequenceService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Datos de la empresa del usuario autenticado + sus usuarios' })
  async getEmpresa(@Request() req: any) {
    return await this.empresaService.getEmpresa(req.user.empresaId);
  }

  @Patch()
  @ApiOperation({ summary: 'Actualizar datos de la empresa (el RNC no es editable)' })
  async updateEmpresa(@Body() dto: UpdateEmpresaDto, @Request() req: any) {
    return await this.empresaService.updateEmpresa(req.user.empresaId, dto);
  }

  @Get('secuencias')
  @Roles('admin', 'member') // lectura para cualquier rol
  @ApiOperation({ summary: 'Secuencias eNCF por tipo de e-CF (última y próximo eNCF)' })
  async getSecuencias(@Request() req: any) {
    return await this.ncfSequenceService.listSequences(req.user.empresaId);
  }

  @Put('secuencias/:tipoEcf')
  @ApiOperation({
    summary:
      'Fijar el contador de secuencia de un tipo de e-CF (no puede reducirse)',
  })
  async setSecuencia(
    @Param('tipoEcf') tipoEcf: string,
    @Body() dto: SetSecuenciaDto,
    @Request() req: any,
  ) {
    return await this.ncfSequenceService.setSequence(
      req.user.empresaId,
      tipoEcf,
      dto.ultimaSecuencia,
    );
  }

  @Post('usuarios')
  @ApiOperation({ summary: 'Crear usuario (rol member) en la empresa' })
  async createUsuario(@Body() dto: CreateEmpresaUserDto, @Request() req: any) {
    return await this.empresaService.createUsuario(req.user.empresaId, dto);
  }

  @Delete('usuarios/:id')
  @ApiOperation({ summary: 'Desactivar usuario de la empresa (soft delete)' })
  async deactivateUsuario(@Param('id') id: string, @Request() req: any) {
    return await this.empresaService.deactivateUsuario(
      req.user.empresaId,
      id,
      req.user.id,
    );
  }
}
