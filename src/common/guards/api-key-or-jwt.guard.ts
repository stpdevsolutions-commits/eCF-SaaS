import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';

/**
 * Permite dos formas de autenticación en las rutas de e-CF:
 *
 * 1. **API-key de servicio** (servidor a servidor): si la petición trae el
 *    header `x-api-key` con el valor de `ECF_SERVICE_API_KEY`, se acepta y se
 *    inyecta un `req.user` sintético apuntando a la empresa y al usuario de
 *    servicio configurados (`ECF_SERVICE_EMPRESA_ID` / `ECF_SERVICE_USER_ID`).
 *    Lo usa el STP ERP para emitir comprobantes desde un Pago sin depender de
 *    un login de usuario. Mismo patrón desacoplado que ya se usa con Vigía y
 *    la API de WhatsApp.
 *
 * 2. **JWT normal** (usuario logueado en el frontend de e-CF): si no hay
 *    API-key válida, se delega en el guard JWT de siempre.
 *
 * Si `ECF_SERVICE_API_KEY` no está configurada, la vía de servicio queda
 * deshabilitada por completo (nunca acepta un header vacío que coincida).
 */
@Injectable()
export class ApiKeyOrJwtGuard extends AuthGuard('jwt') {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];
    const expected = this.configService.get<string>('ECF_SERVICE_API_KEY');

    if (expected && apiKey && apiKey === expected) {
      const empresaId = this.configService.get<string>(
        'ECF_SERVICE_EMPRESA_ID',
      );
      const usuarioId = this.configService.get<string>('ECF_SERVICE_USER_ID');
      if (!empresaId || !usuarioId) {
        throw new UnauthorizedException(
          'La vía de servicio de e-CF no está configurada por completo (falta ECF_SERVICE_EMPRESA_ID o ECF_SERVICE_USER_ID).',
        );
      }
      // Mismo shape que devuelve la estrategia JWT (id, empresaId, rol).
      request.user = {
        id: usuarioId,
        empresaId,
        rol: 'admin',
        servicio: true,
      };
      return true;
    }

    return super.canActivate(context);
  }
}
