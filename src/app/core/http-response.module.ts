import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { PersistenceModule } from "./persistence/persistence.module";
import { GlobalExceptionFilter } from "./filters/global-exception.filter";
import { HttpResponseInterceptor } from "./interceptors/http-response.interceptor";

/** One HTTP response boundary for every controller, including guards and pipes. */
@Module({
  imports: [PersistenceModule],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: HttpResponseInterceptor },
  ],
})
export class HttpResponseModule {}
