import { PartialType } from "@nestjs/swagger";
import { CreateBlockedTimeDto } from "./create-blocked-time.dto";

/** Partial update of a blocked time; omitted fields stay unchanged, `employeeId: null` turns it into a clinic-wide closure. */
export class UpdateBlockedTimeDto extends PartialType(CreateBlockedTimeDto) {}
