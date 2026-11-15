import { Injectable } from "@nestjs/common";
import { Actor } from "../core/authorization";
import { ReservationBusinessService } from "./reservation.business.service";
import { CreateReservationDto } from "./dto/create-reservation.dto";
import { UpdateReservationStatusDto } from "./dto/update-reservation.dto";
import { ConfirmPendingDto } from "./dto/confirm-pending.dto";
import { ConfirmRescheduleDto } from "./dto/confirm-reschedule.dto";
import { ListReservationsQueryDto } from "./dto/list-reservations-query.dto";

@Injectable()
export class ReservationService {
  constructor(private readonly business: ReservationBusinessService) {}
  getAll(query: ListReservationsQueryDto) { return this.business.getAll(query); }
  getById(id: string, actor: Actor) { return this.business.getById(id, actor); }
  create(dto: CreateReservationDto, userId: string) { return this.business.createReservation(dto, userId); }
  update(id: string, dto: UpdateReservationStatusDto) { return this.business.updateReservationStatus(id, dto); }
  delete(id: string) { return this.business.cancel(id); }
  findAll(query: ListReservationsQueryDto) { return this.business.getAll(query); }
  findOne(id: string, actor: Actor) { return this.business.getById(id, actor); }
  cancel(id: string) { return this.business.cancel(id); }
  createReservation(dto: CreateReservationDto, userId: string) { return this.business.createReservation(dto, userId); }
  updateReservationStatus(id: string, dto: UpdateReservationStatusDto) { return this.business.updateReservationStatus(id, dto); }
  findAllReservations() { return this.business.findAllReservations(); }
  findByClient(id: string) { return this.business.findByClient(id); }
  findByEmployee(id: string) { return this.business.findByEmployee(id); }
  findByEmployeeAndDate(id: string, date: Date) { return this.business.findByEmployeeAndDate(id, date); }
  confirmPendingReservation(id: string, dto: ConfirmPendingDto) { return this.business.confirmPendingReservation(id, dto); }
  confirmRescheduledReservation(id: string, dto: ConfirmRescheduleDto, actor: Actor) { return this.business.confirmRescheduledReservation(id, dto, actor); }
  rejectRescheduledReservation(id: string, actor: Actor, note?: string) { return this.business.rejectRescheduledReservation(id, actor, note); }
}
