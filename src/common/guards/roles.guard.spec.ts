import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  const mockContext = (user: any): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user }),
      }),
    }) as any;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('permite el acceso cuando el handler no declara roles', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    expect(guard.canActivate(mockContext({ rol: 'member' }))).toBe(true);
  });

  it('permite el acceso a un admin cuando se requiere admin', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);

    expect(guard.canActivate(mockContext({ rol: 'admin' }))).toBe(true);
  });

  it('niega el acceso a un member cuando se requiere admin', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);

    expect(guard.canActivate(mockContext({ rol: 'member' }))).toBe(false);
  });

  it('niega el acceso si no hay usuario en el request', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);

    expect(guard.canActivate(mockContext(undefined))).toBe(false);
  });

  it('lee la metadata con la clave ROLES_KEY del handler y la clase', () => {
    const spy = jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['admin']);
    const ctx = mockContext({ rol: 'admin' });

    guard.canActivate(ctx);

    expect(spy).toHaveBeenCalledWith(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
  });
});
