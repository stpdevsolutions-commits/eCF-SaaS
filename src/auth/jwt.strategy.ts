import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { getJwtSecret } from './jwt-secret.util';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,  // sin private — solo se usa en super()
    private authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(configService),
    });
  }

  /**
   * El payload del token incluye empresaId y rol, pero la fuente de verdad
   * es la BD: validateUser carga el usuario fresco, así los tokens viejos
   * (sin empresaId) siguen funcionando después del backfill sin re-login.
   * Usuarios desactivados (activo=false) devuelven null → 401.
   */
  async validate(payload: any) {
    const user = await this.authService.validateUser(payload.sub);
    if (!user) {
      return null;
    }
    // No exponer el hash de la contraseña en req.user
    const { password: _password, ...safeUser } = user as any;
    return safeUser;
  }
}