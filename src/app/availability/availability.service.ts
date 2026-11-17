import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { Actor } from "../core/authorization";
import { ErrorMetadata } from "../core/enums/error-metadata.enum";
import { applicationError } from "../core/exceptions/application-error";
import { PersistenceService } from "../core/persistence/persistence.service";
import { overlappingBlocks } from "../blocked-times/blocked-time.queries";
import { ClinicServiceEntity } from "../clinic-services/entities/clinic-service.entity";
import { EmployeeServiceEntity } from "../clinic-services/entities/employee-service.entity";
import { isBookableEmployee } from "../employees/employee-status";
import { EmployeeEntity } from "../employees/entities/employee.entity";
import { findSchedulesValidOn, workingInstants } from "../employee-schedules/employee-schedule-policy";
import { findConfirmedReservationsBetween } from "../reservation/open-reservations";
import { CLINIC_POLICY, dateKey } from "../reservation/reservation-policy";
import { SystemSettingCode } from "../system-settings/enums/system-setting-code.enum";
import { SystemSettingsService } from "../system-settings/system-settings.service";
import { AvailabilityMessages } from "./availability.messages";
import { clinicDayWindow, generateSlots } from "./availability-policy";
import { AvailabilityQueryDto, AvailabilityResponseDto } from "./dto/availability.dto";
import { normalizeId } from "../core/catalog";

/**
 * Free appointment slots of a clinic date (stateless; plain reads without locks, so the result is indicative: the
 * confirmation re-checks everything under the closures and employee applocks). For each employee qualified for the
 * service (vc_employee_services) and bookable on the date (isBookableEmployee): working periods of their schedule valid
 * on the date (or CLINIC_POLICY when they have none), always inside CLINIC_POLICY, minus clinic closures and their own
 * blocks, minus their CONFIRMED reservations widened by RESERVATION_BUFFER_MINUTES; candidate starts every
 * CLINIC_POLICY.slotDurationMinutes from the start of each period, lasting the service duration. Only the employee's free
 * slots are returned: reservations and blocks (and anything about third parties) are never exposed.
 */
@Injectable()
export class AvailabilityService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly persistence: PersistenceService,
    private readonly settings: SystemSettingsService,
  ) {}

  async getAvailability(query: AvailabilityQueryDto, actor: Actor, now = new Date()): Promise<AvailabilityResponseDto> {
    const date = dateKey(query.date);
    const manager = this.dataSource.manager;
    const service = await this.persistence.execute(() => manager.findOne(ClinicServiceEntity, { where: { id: query.serviceId } }));
    if (!service || (!service.isActive && !actor.isAdmin)) throw applicationError(ErrorMetadata.NOT_FOUND, AvailabilityMessages.SERVICE_NOT_FOUND);
    if (!service.isActive) throw applicationError(ErrorMetadata.CONFLICT, AvailabilityMessages.SERVICE_INACTIVE, undefined, { code: "SERVICE_INACTIVE" });
    if (query.employeeId && !(await this.persistence.execute(() => manager.count(EmployeeEntity, { where: { id: query.employeeId } })))) {
      throw applicationError(ErrorMetadata.NOT_FOUND, AvailabilityMessages.EMPLOYEE_NOT_FOUND);
    }
    const response: AvailabilityResponseDto = { date, timeZone: CLINIC_POLICY.timeZone, slotMinutes: CLINIC_POLICY.slotDurationMinutes, serviceId: service.id, employees: [] };

    const qualifications = await this.persistence.execute(() => manager.find(EmployeeServiceEntity, {
      where: query.employeeId ? { serviceId: service.id, employeeId: query.employeeId } : { serviceId: service.id },
      relations: { employee: { user: true } },
    }));
    const candidates = qualifications.map(row => row.employee).filter(employee => isBookableEmployee(employee, date))
      .sort((a, b) => (a.user?.name ?? "").localeCompare(b.user?.name ?? "") || a.id.localeCompare(b.id));
    const window = clinicDayWindow(date);
    if (!window || !candidates.length) {
      response.employees = candidates.map(employee => ({ employeeId: employee.id, name: employee.user.name, slots: [] }));
      return response;
    }

    const ids = candidates.map(employee => employee.id);
    const bufferMinutes = await this.settings.getNonNegativeInteger(SystemSettingCode.RESERVATION_BUFFER_MINUTES);
    const buffer = bufferMinutes * 60_000;
    const [schedules, blocks, confirmed] = await this.persistence.execute(async () => [
      await findSchedulesValidOn(manager, ids, date),
      await overlappingBlocks(manager, window.start, window.end, ids).getMany(),
      await findConfirmedReservationsBetween(manager, new Date(window.start.getTime() - buffer), new Date(window.end.getTime() + buffer), ids),
    ] as const);
    const of = <T extends { employeeId: string | null }>(rows: readonly T[], id: string) => rows.filter(row => !!row.employeeId && normalizeId(row.employeeId) === normalizeId(id));

    response.employees = candidates.map(employee => ({
      employeeId: employee.id,
      name: employee.user.name,
      slots: generateSlots(
        workingInstants(of(schedules, employee.id), date),
        blocks.filter(block => !block.employeeId || normalizeId(block.employeeId) === normalizeId(employee.id)).map(block => ({ start: block.startAt, end: block.endAt })),
        of(confirmed, employee.id).map(reservation => ({ start: reservation.startAt, end: reservation.endAt })),
        { durationMinutes: service.durationMinutes, stepMinutes: CLINIC_POLICY.slotDurationMinutes, bufferMinutes, now },
      ),
    }));
    return response;
  }
}
