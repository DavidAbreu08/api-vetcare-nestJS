import { SetMetadata } from "@nestjs/common";
import { Role } from "../enums/role.enum";
import { MessagesHelper } from "src/app/helpers/messages.helper";

export const Roles = (...roles: [Role, ...Role[]]) => SetMetadata(MessagesHelper.ROLES_KEY, roles)