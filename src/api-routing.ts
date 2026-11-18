import { INestApplication } from "@nestjs/common";

/** Shared by production bootstrap and HTTP integration tests. */
export const API_PREFIX = "api/vetcare";

export function configureApiRouting(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);
}
