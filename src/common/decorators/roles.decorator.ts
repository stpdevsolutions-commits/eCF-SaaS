import { SetMetadata } from '@nestjs/common';

export type UserRol = 'admin' | 'member';

export const ROLES_KEY = 'roles';

/**
 * Restringe un handler o controller a los roles indicados.
 * Debe usarse junto con JwtAuthGuard + RolesGuard:
 *
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *   @Roles('admin')
 */
export const Roles = (...roles: UserRol[]) => SetMetadata(ROLES_KEY, roles);
