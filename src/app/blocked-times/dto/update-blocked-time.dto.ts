import { PartialType } from "@nestjs/mapped-types";
import { CreateBlockedTimeDto } from "./create-blocked-time.dto";

/** Update selected fields of a global clinic time block. */
export class UpdateBlockedTimeDto extends PartialType(CreateBlockedTimeDto) {}
