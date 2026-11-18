import { HttpStatus } from "@nestjs/common";
import { ErrorMetadata } from "../enums/error-metadata.enum";

export interface HttpResponse<T = unknown> {
  status: HttpStatus;
  friendlyMessage: string;
  success: boolean;
  result: T | null;
  errorMetadata?: ErrorMetadata;
}
