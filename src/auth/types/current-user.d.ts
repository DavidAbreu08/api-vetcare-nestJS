import { Actor } from "src/app/core/authorization";

/** request.user after JWT validation: account identity plus active role ids and derived flags. */
export type CurrentUser = Actor & {
  email: string;
  name: string;
};
