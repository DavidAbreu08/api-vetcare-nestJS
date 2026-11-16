import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Controller, Get } from '@nestjs/common';
import { CLINIC_POLICY } from './reservation-policy';

@Controller('clinic')
@ApiTags("Clínica")
export class ClinicController {
  @Get('hours')
  @ApiOperation({ summary: "Consultar os horários e as regras da clínica", description: "Operação pública. Devolve o calendário e as regras base da clínica." })
  hours() { return CLINIC_POLICY; }
}
