import { HttpException } from "@nestjs/common";
import { ErrorHttpStatus, ErrorMetadata } from "../enums/error-metadata.enum";

/** An explicitly public domain message, with a private diagnostic cause. */
export class ApplicationException extends HttpException {
  constructor(metadata: ErrorMetadata, friendlyMessage: string, cause?: unknown) {
    super({ errorMetadata: metadata, friendlyMessage }, ErrorHttpStatus[metadata], { cause });
    this.message = friendlyMessage;
  }
}
