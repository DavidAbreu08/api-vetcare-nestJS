import { Injectable } from "@nestjs/common";
import { Actor } from "../core/authorization";
import { ListQueryDto } from "../core/dto/list-query.dto";
import { ReservationBusinessService } from "./reservation.business.service";
import { CreateReservationDto } from "./dto/create-reservation.dto";
import { ListReservationsQueryDto } from "./dto/list-reservations-query.dto";
import { AssignReservationEmployeeDto, ReservationReasonDto, RescheduleReservationDto } from "./dto/reservation-actions.dto";

/** Application entry points for the reservations resource. */
@Injectable()
export class ReservationService {
  constructor(private readonly business: ReservationBusinessService) {}
  list(query: ListReservationsQueryDto, actor: Actor) { return this.business.list(query, actor); }
  getById(id: string, actor: Actor) { return this.business.getById(id, actor); }
  getHistory(id: string, query: ListQueryDto, actor: Actor) { return this.business.getHistory(id, query, actor); }
  create(dto: CreateReservationDto, actor: Actor) { return this.business.create(dto, actor); }
  assignEmployee(id: string, dto: AssignReservationEmployeeDto, actor: Actor) { return this.business.assignEmployee(id, dto, actor); }
  confirm(id: string, dto: ReservationReasonDto, actor: Actor) { return this.business.confirm(id, dto, actor); }
  reschedule(id: string, dto: RescheduleReservationDto, actor: Actor) { return this.business.reschedule(id, dto, actor); }
  cancel(id: string, dto: ReservationReasonDto, actor: Actor) { return this.business.cancel(id, dto, actor); }
  markNoShow(id: string, dto: ReservationReasonDto, actor: Actor) { return this.business.markNoShow(id, dto, actor); }
}
