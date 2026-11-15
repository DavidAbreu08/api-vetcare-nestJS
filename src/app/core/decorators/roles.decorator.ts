import { SetMetadata } from "@nestjs/common";
import { SystemRole } from "../enums/system-role.enum";
import { MessagesHelper } from "src/app/helpers/messages.helper";

/** Requires ANY of the given system roles; each is resolved to a role id through vc_system_settings. */
export const Roles = (...roles: [SystemRole, ...SystemRole[]]) =>
  SetMetadata(MessagesHelper.ROLES_KEY, roles);
