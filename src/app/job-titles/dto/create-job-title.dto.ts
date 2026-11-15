import { PartialType } from "@nestjs/swagger";
import { CreateCatalogEntryDto } from "../../core/dto/catalog.dto";

/** Creates a professional job title that can be assigned to employees. */
export class CreateJobTitleDto extends CreateCatalogEntryDto {}

export class UpdateJobTitleDto extends PartialType(CreateJobTitleDto) {}
