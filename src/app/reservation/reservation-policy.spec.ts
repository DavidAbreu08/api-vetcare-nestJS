import { BadRequestException } from '@nestjs/common';
import { assertTransition, clinicDateTime, dateKey, overlaps, validateInterval } from './reservation-policy';
import { ReservationStatus as Status } from '../core/enums/reservation-status.enum';

describe('Clinic reservation policy', () => {
  it.each([
    ['10:15','10:30','10:00','11:00',true],
    ['10:00','11:00','10:15','10:30',true],
    ['10:00','11:00','10:00','11:00',true],
    ['09:30','10:15','10:00','11:00',true],
    ['10:45','11:30','10:00','11:00',true],
    ['09:00','10:00','10:00','11:00',false],
    ['11:00','12:00','10:00','11:00',false],
  ])('checks half-open intervals %s-%s vs %s-%s', (a,b,c,d,expected) => {
    expect(overlaps(a as string,b as string,c as string,d as string)).toBe(expected);
  });
  it.each(['2026-99-01','2026-02-30','bad','2026-13-14','2026-11-14extra','2026-11-14T00:00:00Z'])('rejects invalid dates with HTTP 400: %s', date => {
    expect(() => dateKey(date)).toThrow(BadRequestException);
  });
  it('rejects Invalid Date without RangeError', () => expect(() => dateKey(new Date('bad'))).toThrow(BadRequestException));
  it('converts winter and summer clinic times independently of server timezone', () => {
    expect(clinicDateTime('2030-01-07','10:00').toISOString()).toBe('2030-01-07T10:00:00.000Z');
    expect(clinicDateTime('2030-07-08','10:00').toISOString()).toBe('2030-07-08T09:00:00.000Z');
  });
  it('rejects missing spring and ambiguous autumn wall times', () => {
    expect(() => clinicDateTime('2026-03-29','01:30')).toThrow(BadRequestException);
    expect(() => clinicDateTime('2026-10-25','01:30')).toThrow(BadRequestException);
  });
  it('rejects malformed, reversed and off-hours intervals', () => {
    for (const [start,end] of [['7:00','08:00'],['10:00','09:00'],['06:00','08:00']]) {
      expect(() => validateInterval('2030-01-07',start,end)).toThrow(BadRequestException);
    }
    expect(() => validateInterval('2020-01-06','10:00','10:30')).toThrow(BadRequestException);
  });
  it('prevents reopening terminal states and permits rescheduling proposals', () => {
    expect(() => assertTransition(Status.CANCELLED,Status.CONFIRMED)).toThrow();
    expect(() => assertTransition(Status.COMPLETED,Status.RESCHEDULED)).toThrow();
    expect(() => assertTransition(Status.CONFIRMED,Status.RESCHEDULED)).not.toThrow();
    expect(() => assertTransition(Status.RESCHEDULED,Status.RESCHEDULED)).not.toThrow();
  });
});
