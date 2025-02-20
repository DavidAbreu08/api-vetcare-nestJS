import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../enums/role.enum';
import { MessagesHelper } from 'src/app/helpers/messages.helper';

@Injectable()
export class RolesGuard implements CanActivate {

  constructor(private reflector: Reflector){}

  canActivate(
    context: ExecutionContext,
  ): boolean {

    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(MessagesHelper.ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const user = context.switchToHttp().getRequest().user;
    //console.log(user)
    const hasRequiredRole = requiredRoles.some((role) => user.role === role);
    return hasRequiredRole;
  }
}
