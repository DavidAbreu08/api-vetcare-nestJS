import { INestApplication, Logger } from "@nestjs/common";
import type * as Swagger from "@nestjs/swagger";
import { prepareSwaggerDocument, SWAGGER_TAGS } from "./swagger-document";

/** Optional local documentation; does not modify guards or application routes. */
export function setupSwagger(app: INestApplication): void {
  const enabled = process.env.SWAGGER_ENABLED === "true" ||
    (process.env.SWAGGER_ENABLED !== "false" && process.env.NODE_ENV !== "production");
  if (!enabled) return;

  let swagger: typeof Swagger;
  try {
    swagger = require("@nestjs/swagger") as typeof Swagger;
  } catch (error: unknown) {
    if ((error as { code?: string })?.code !== "MODULE_NOT_FOUND") throw error;
    Logger.warn("Swagger unavailable. Restore the declared dependencies with npm ci to enable /docs.", "Swagger");
    return;
  }

  const builder = new swagger.DocumentBuilder()
    .setTitle("VetCare API")
    .setDescription("Veterinary clinic management. Operations are grouped by domain. Sign in at POST /api/vetcare/auth/login and use the token in Authorize for protected operations. JSON responses follow the global success or error contract; HEAD, 204, 304 and file responses do not use this envelope.")
    .setVersion("0.0.1")
    .addBearerAuth({ type: "http", scheme: "bearer", bearerFormat: "JWT" }, "bearer");
  for (const tag of SWAGGER_TAGS) builder.addTag(tag.name, tag.description);

  const document = prepareSwaggerDocument(swagger.SwaggerModule.createDocument(app, builder.build()));
  swagger.SwaggerModule.setup("docs", app, document, {
    useGlobalPrefix: false,
    jsonDocumentUrl: "/docs-json",
    swaggerOptions: { persistAuthorization: false, operationsSorter: "alpha", docExpansion: "list", displayRequestDuration: true },
  });
  Logger.log("Documentation: http://localhost:3000/docs", "Swagger");
}
