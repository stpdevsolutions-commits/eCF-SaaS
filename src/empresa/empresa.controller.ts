import {
  Controller,
  Get,
  Post,
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
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

/**
 * Gestión de la empresa y sus usuarios. Solo accesible para rol 'admin'.
 */
@ApiTags('Empresa')
@Controller('empresa')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@ApiBearerAuth()
export class EmpresaController {
  constructor(private empresaService: EmpresaService) {}

  @Get()
  @ApiOperation({ summary: 'Datos de la empresa del usuario autenticado + sus usuarios' })
  async getEmpresa(@Request() req: any) {
    return await this.empresaService.getEmpresa(req.user.empresaId);
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
