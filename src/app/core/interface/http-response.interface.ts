import { UserInterface } from "./user.interface";

export interface HttpResponse {
    statusCode: number,
    message: string,
    user?: UserInterface
  }