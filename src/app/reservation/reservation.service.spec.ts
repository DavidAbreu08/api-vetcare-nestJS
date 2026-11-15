import { ReservationService } from './reservation.service';
import { TimeUtilsService } from './time-utils.service';
import { Role } from '../core/enums/role.enum';
import { ReservationStatus as Status } from '../core/enums/reservation-status.enum';
import { BlockedTimeService } from './blocked-time.service';

function setup(status = Status.CONFIRMED) {
  const reservation = { id:'r',status,date:new Date('2030-01-07T00:00:00Z'),timeStart:'10:00',timeEnd:'10:30',
    employee:{id:'vet'},client:{id:'client',email:'test@example.invalid',name:'Client'},rescheduleNote:'existing' };
  const query: any = { where:jest.fn().mockReturnThis(),andWhere:jest.fn().mockReturnThis(),getCount:jest.fn().mockResolvedValue(0) };
  const repo = { findOne:jest.fn().mockResolvedValue(reservation),save:jest.fn(async value => value),create:jest.fn(value => ({id:'r',...value})),createQueryBuilder:jest.fn(() => query) };
  const email = { sendReservationCreatedEmail:jest.fn().mockResolvedValue(undefined),sendReservationConfirmedEmail:jest.fn().mockResolvedValue(undefined),sendReservationCancelledEmail:jest.fn().mockResolvedValue(undefined),sendReservationRescheduledEmail:jest.fn().mockResolvedValue(undefined) };
  const users = { findOne:jest.fn().mockResolvedValue({id:'vet',role:Role.FUNCIONARIO,isActive:true}) };
  const animals = { findOne:jest.fn().mockResolvedValue({owner:{id:'vet'}}) };
  const blocks = { find:jest.fn().mockResolvedValue([]), save:jest.fn() };
  const service = new ReservationService(new TimeUtilsService(),email as any,repo as any,users as any,animals as any,blocks as any);
  return {service,reservation,query,repo,email,users,animals,blocks};
}
describe('Reservation application coordination', () => {
  it('cancels without new optional hours, preserving interval and notes', async () => {
    const {service,repo} = setup();
    const result = await service.updateReservationStatus('r',{status:Status.CANCELLED} as any);
    expect(result).toMatchObject({status:Status.CANCELLED,timeStart:'10:00',timeEnd:'10:30',rescheduleNote:'existing'});
    expect(repo.createQueryBuilder).not.toHaveBeenCalled();
  });
  it('preserves state on note-only updates, even for past reservations', async () => {
    const {service,reservation} = setup(); reservation.date = new Date('2020-01-06T00:00:00Z');
    expect(await service.updateReservationStatus('r',{rescheduleNote:'note'} as any)).toMatchObject({status:Status.CONFIRMED,rescheduleNote:'note'});
  });
  it('validates effective reschedule fields and excludes its own booking', async () => {
    const {service,query} = setup();
    await service.updateReservationStatus('r',{status:Status.RESCHEDULED,newTimeEnd:'11:00'} as any);
    expect(query.andWhere).toHaveBeenCalledWith('r.id != :excludeId',{excludeId:'r'});
    expect(query.where).toHaveBeenCalledWith('r.employeeId = :employeeId',{employeeId:'vet'});
  });
  it('allows reassignment without requiring a redundant state transition', async () => {
    const {service,query} = setup();
    const result = await service.updateReservationStatus('r',{employeeId:'vet'} as any);
    expect(result.status).toBe(Status.CONFIRMED);
    expect(query.andWhere).toHaveBeenCalledWith('r.id != :excludeId',{excludeId:'r'});
  });
  it('validates implicitly assigned employee before creating', async () => {
    const {service,query,repo} = setup(); query.getCount.mockResolvedValue(1);
    await expect(service.createReservation({animalId:'a',date:'2030-01-07',timeStart:'10:00',timeEnd:'10:30'} as any,'vet')).rejects.toMatchObject({response:{code:'EMPLOYEE_UNAVAILABLE'}});
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('rejects confirming a reservation whose assigned employee became inactive', async () => {
    const {service,users,repo} = setup(Status.RESCHEDULED);
    users.findOne.mockResolvedValue({id:'vet',role:Role.FUNCIONARIO,isActive:false});
    await expect(service.confirmRescheduledReservation('r',{status:Status.CONFIRMED} as any,{id:'client',role:Role.CLIENTE})).rejects.toThrow('Invalid employee ID');
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('rejects bookings contained by blocked intervals before saving', async () => {
    const {service,blocks,repo} = setup(); blocks.find.mockResolvedValue([{timeStart:'09:00',timeEnd:'11:00'}]);
    await expect(service.createReservation({animalId:'a',date:'2030-01-07',timeStart:'10:00',timeEnd:'10:30'} as any,'vet')).rejects.toMatchObject({response:{code:'TIME_BLOCKED'}});
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('reports persisted success when SMTP fails and sends only after save', async () => {
    const {service,email,repo} = setup(Status.RESCHEDULED);
    email.sendReservationConfirmedEmail.mockImplementation(async () => {
      expect(repo.save).toHaveBeenCalledTimes(1); throw new Error('SMTP unavailable');
    });
    const result = await service.confirmRescheduledReservation('r',{status:Status.CONFIRMED} as any,{id:'client',role:Role.CLIENTE});
    expect(result).toMatchObject({status:Status.CONFIRMED,notificationStatus:'failed'});
  });
  it('never sends email when persistence fails', async () => {
    const {service,email,repo} = setup(Status.RESCHEDULED); repo.save.mockRejectedValue(new Error('DB unavailable'));
    await expect(service.confirmRescheduledReservation('r',{status:Status.CONFIRMED} as any,{id:'client',role:Role.CLIENTE})).rejects.toThrow('DB unavailable');
    expect(email.sendReservationConfirmedEmail).not.toHaveBeenCalled();
  });
  it('checks blocked interval containment in the blocking service too', async () => {
    const {blocks} = setup(); blocks.find.mockResolvedValue([{timeStart:'10:00',timeEnd:'11:00'}]);
    const service = new BlockedTimeService(blocks as any,new TimeUtilsService());
    expect(await service.isTimeRangeBlocked(new Date('2030-01-07'),'10:15','10:30')).toBe(true);
    expect(await service.isTimeRangeBlocked(new Date('2030-01-07'),'11:00','12:00')).toBe(false);
  });
});
