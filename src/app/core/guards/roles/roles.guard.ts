import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../enums/role.enum';
import { MessagesHelper } from 'src/app/helpers/messages.helper';

@Injectable()
export class RolesGuard implements CanActivate {

  constructor(private readonly reflector: Reflector){}

  canActivate(
    context: ExecutionContext,
  ): boolean {

    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(MessagesHelper.ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      // If no roles are specified, the route is still public to any authenticated user
      return true;
    }
  
    const { user } = context.switchToHttp().getRequest();
  
    return requiredRoles.includes(user.role);
  }
}
