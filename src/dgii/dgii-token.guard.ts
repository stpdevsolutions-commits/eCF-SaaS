import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { DgiiAutenticacionService } from './dgii-autenticacion.service';

/**
 * Protege las URL que la DGII/otros emisores consumen (Recepción, Aprobación
 * Comercial) con el token Bearer emitido por DgiiAutenticacionService.
 *
 * Solo exige el token si DGII_WEBHOOK_AUTH_REQUIRED=true. Por defecto NO lo
 * exige: la URL de Autenticación es opcional en el Directorio FE, y si no se
 * registra allí, la DGII llama a las URL sin token — exigirlo rompería el flujo
 * que ya funciona. Activarlo SOLO después de registrar la URL de Autenticación.
 */
@Injectable()
export class DgiiTokenGuard implements CanActivate {
  constructor(private autenticacion: DgiiAutenticacionService) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.autenticacion.autenticacionRequerida()) return true;
    const req = context.switchToHttp().getRequest();
    const cabecera: string | undefined = req.headers?.authorization;
    const token = cabecera?.match(/^Bearer\s+(\S+)$/i)?.[1];
    req.clienteDgii = this.autenticacion.validarToken(token);
    return true;
  }
}
