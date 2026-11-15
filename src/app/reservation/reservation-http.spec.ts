import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import request = require('supertest');
import { RolesGuard } from '../core/guards/roles/roles.guard';
import { ReservationController } from './reservation.controller';
import { ReservationService } from './reservation.service';
import { ClinicController } from './clinic.controller';
import { policyError } from './reservation-policy';

describe('Reservation HTTP validation contract (no DB/SMTP)', () => {
  let app: INestApplication;
  const service = { createReservation:jest.fn(() => policyError('TIME_BLOCKED','This time slot is blocked')) };
  beforeAll(async () => {
    const module = await Test.createTestingModule({controllers:[ReservationController,ClinicController],providers:[{provide:ReservationService,useValue:service}]})
      .overrideGuard(AuthGuard('jwt')).useValue({canActivate:context => { context.switchToHttp().getRequest().user = {id:'client'}; return true; }})
      .overrideGuard(RolesGuard).useValue({canActivate:() => true}).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true}));
    await app.init();
  });
  afterAll(() => app.close());
  const valid = {animalId:'00000000-0000-4000-8000-000000000001',date:'2030-01-07',timeStart:'10:00',timeEnd:'10:30'};
  it('publishes one clinic policy contract', async () => {
    const response = await request(app.getHttpServer()).get('/api/clinic/hours').expect(200);
    expect(response.body).toMatchObject({start:'07:00',end:'20:00',timeZone:'Europe/Lisbon',bufferMinutes:15});
  });
  it.each([{timeStart:'24:00'},{date:'2030-01-07T00:00:00Z'},{unexpected:true}])('rejects invalid DTO before application service %p', async invalid => {
    service.createReservation.mockClear();
    await request(app.getHttpServer()).post('/api/reservation/create').send({...valid,...invalid}).expect(400);
    expect(service.createReservation).not.toHaveBeenCalled();
  });
  it('returns stable code together with Nest message/statusCode', async () => {
    const response = await request(app.getHttpServer()).post('/api/reservation/create').send(valid).expect(400);
    expect(response.body).toMatchObject({statusCode:400,code:'TIME_BLOCKED',message:'This time slot is blocked'});
  });
});
