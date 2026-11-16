import { CallHandler, ExecutionContext, HttpStatus, Injectable, NestInterceptor, StreamableFile } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable, map } from "rxjs";
import { RESPONSE_MESSAGE } from "../decorators/response-message.decorator";
import { HttpResponse } from "../interface/http-response.interface";

const DEFAULT_MESSAGE = "Operação concluída com sucesso.";

@Injectable()
export class HttpResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();
    const response = context.switchToHttp().getResponse();
    const request = context.switchToHttp().getRequest();
    const message = this.reflector.getAllAndOverride<string>(RESPONSE_MESSAGE, [context.getHandler(), context.getClass()]);

    return next.handle().pipe(map((data: unknown) => {
      if (response.headersSent || data instanceof StreamableFile) return data;
      if (request.method === "HEAD" || response.statusCode === HttpStatus.NO_CONTENT || response.statusCode === HttpStatus.NOT_MODIFIED) return undefined;
      const body: HttpResponse = {
        status: response.statusCode,
        friendlyMessage: message ?? DEFAULT_MESSAGE,
        success: true,
        result: data ?? null,
      };
      return body;
    }));
  }
}
