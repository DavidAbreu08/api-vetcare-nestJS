import { ApiProperty } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayUnique, IsArray, IsUUID } from "class-validator";

/** Replaces the full set of roles held by a user. */
export class ReplaceUserRolesDto {
  @ApiProperty({ description: "Role UUIDs; the list replaces every current assignment. New assignments require active roles.", type: [String], format: "uuid" })
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique((id: string) => (typeof id === "string" ? id.toLowerCase() : id))
  @IsUUID("all", { each: true })
  roleIds: string[];
}
