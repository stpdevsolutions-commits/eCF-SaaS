import { ConfigService } from '@nestjs/config';

const DEV_FALLBACK_SECRET = 'dev-only-insecure-jwt-secret';

/**
 * Resuelve el secreto JWT desde la variable de entorno JWT_SECRET.
 *
 * - En producción (NODE_ENV=production): lanza un error si falta,
 *   impidiendo que la app arranque con un secreto inseguro.
 * - En desarrollo: usa un fallback y emite un warning en consola.
 */
export function getJwtSecret(configService: ConfigService): string {
  const secret = configService.get<string>('JWT_SECRET');
  if (secret) {
    return secret;
  }

  if (configService.get<string>('NODE_ENV') === 'production') {
    throw new Error(
      'JWT_SECRET no está definido. En producción (NODE_ENV=production) es obligatorio configurar JWT_SECRET.',
    );
  }

  console.warn(
    '⚠️  JWT_SECRET no está definido: usando un secreto de desarrollo inseguro. Configura JWT_SECRET en tu .env.',
  );
  return DEV_FALLBACK_SECRET;
}
