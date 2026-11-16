import { PartialType } from "@nestjs/swagger";
import { CreateCatalogEntryDto } from "../../core/dto/catalog.dto";

/** Creates a role. Authorization rules refer to roles only through system settings. */
export class CreateRoleDto extends CreateCatalogEntryDto {}

export class UpdateRoleDto extends PartialType(CreateRoleDto) {}
