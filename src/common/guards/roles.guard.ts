import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, UserRol } from '../decorators/roles.decorator';

/**
 * Guard de roles. Lee la metadata puesta por @Roles() y compara con
 * `req.user.rol` (poblado por JwtStrategy desde la BD).
 *
 * Si el handler/controller no declara @Roles(), permite el acceso.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRol[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    return !!user && requiredRoles.includes(user.rol);
  }
}
