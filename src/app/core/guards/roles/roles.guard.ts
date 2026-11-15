import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { MessagesHelper } from "src/app/helpers/messages.helper";
import { SystemRole } from "../../enums/system-role.enum";
import { SystemSettingsService } from "src/app/system-settings/system-settings.service";
import { Actor } from "../../authorization";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly settings: SystemSettingsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<SystemRole[] | undefined>(
      MessagesHelper.ROLES_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!requiredRoles?.length) {
      // Without @Roles the route is available to any authenticated user.
      return true;
    }

    const user = context.switchToHttp().getRequest().user as Partial<Actor> | undefined;
    if (!user || !Array.isArray(user.roleIds) || !user.roleIds.length) return false;

    const owned = new Set(user.roleIds.map(id => id.toLowerCase()));
    const allowed = await this.settings.resolveRoleIds(requiredRoles);
    return allowed.some(id => owned.has(id));
  }
}
