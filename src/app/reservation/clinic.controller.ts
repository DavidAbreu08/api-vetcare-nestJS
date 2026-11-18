import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Controller, Get } from '@nestjs/common';
import { CLINIC_POLICY } from './reservation-policy';

@Controller('clinic')
@ApiTags("Clinic")
export class ClinicController {
  @Get('hours')
  @ApiOperation({ summary: "Get clinic hours and scheduling rules", description: "Public operation. Returns the clinic calendar and base scheduling rules." })
  hours() { return CLINIC_POLICY; }
}
