import { SetMetadata } from "@nestjs/common";

export const RESPONSE_MESSAGE = "vetcare:response-message";

/** Public success message for a controller or an individual operation. */
export const ResponseMessage = (message: string) => SetMetadata(RESPONSE_MESSAGE, message);
