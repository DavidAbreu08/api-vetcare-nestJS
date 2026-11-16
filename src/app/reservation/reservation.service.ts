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
  getAll(query: ListReservationsQueryDto, actor: Actor) { return this.business.getAll(query, actor); }
  getById(id: string, actor: Actor) { return this.business.getById(id, actor); }
  create(dto: CreateReservationDto, actor: Actor) { return this.business.createReservation(dto, actor); }
  update(id: string, dto: UpdateReservationStatusDto, actor: Actor) { return this.business.updateReservationStatus(id, dto, actor); }
  delete(id: string, actor: Actor) { return this.business.cancel(id, actor); }
  findAll(query: ListReservationsQueryDto, actor: Actor) { return this.business.getAll(query, actor); }
  findOne(id: string, actor: Actor) { return this.business.getById(id, actor); }
  cancel(id: string, actor: Actor) { return this.business.cancel(id, actor); }
  createReservation(dto: CreateReservationDto, actor: Actor) { return this.business.createReservation(dto, actor); }
  updateReservationStatus(id: string, dto: UpdateReservationStatusDto, actor: Actor) { return this.business.updateReservationStatus(id, dto, actor); }
  findAllReservations(actor: Actor) { return this.business.findAllReservations(actor); }
  findByClient(actor: Actor) { return this.business.findByClient(actor); }
  findByEmployee(actor: Actor) { return this.business.findByEmployee(actor); }
  findByEmployeeAndDate(id: string, date: Date, actor: Actor) { return this.business.findByEmployeeAndDate(id, date, actor); }
  confirmPendingReservation(id: string, dto: ConfirmPendingDto, actor: Actor) { return this.business.confirmPendingReservation(id, dto, actor); }
  confirmRescheduledReservation(id: string, dto: ConfirmRescheduleDto, actor: Actor) { return this.business.confirmRescheduledReservation(id, dto, actor); }
  rejectRescheduledReservation(id: string, actor: Actor, note?: string) { return this.business.rejectRescheduledReservation(id, actor, note); }
}
