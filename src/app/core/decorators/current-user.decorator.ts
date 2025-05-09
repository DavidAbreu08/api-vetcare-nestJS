import { createParamDecorator, ExecutionContext } from "@nestjs/common";

/**
 * Retrieves the current user from the request object.
 * @param data
 * @param ctx
 * @returns current user from the request
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user; // Ensure `user` is being set in the request object
  }
);
