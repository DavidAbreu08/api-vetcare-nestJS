import { Controller, Get } from '@nestjs/common';
import { CLINIC_POLICY } from './reservation-policy';

@Controller('api/clinic')
export class ClinicController {
  @Get('hours')
  hours() { return CLINIC_POLICY; }
}
