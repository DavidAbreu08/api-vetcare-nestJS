import { Global, Module } from "@nestjs/common";
import { PersistenceService } from "./persistence.service";
import { APP_FILTER } from "@nestjs/core";
import { PersistenceExceptionFilter } from "./persistence-exception.filter";

@Global()
@Module({
  providers: [PersistenceService, { provide: APP_FILTER, useClass: PersistenceExceptionFilter }],
  exports: [PersistenceService],
})
export class PersistenceModule {}
