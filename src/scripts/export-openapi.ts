// Must stay the first import: same UTC process timezone as the other entry points.
import "../force-utc";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import type { INestApplication } from "@nestjs/common";

/**
 * Writes the OpenAPI contract to docs/public/openapi.json without a database (npm run docs:openapi).
 * The application is created in preview mode: modules and controllers are scanned but providers are not instantiated,
 * so TypeORM never connects. Placeholder connection settings only satisfy databaseOptions() at module load time.
 */
const PLACEHOLDER_ENV: Record<string, string> = {
  VETCARE_ENV_FILE: "openapi-export.env.does-not-exist",
  TYPEORM_CONNECTION: "mssql",
  TYPEORM_HOST: "openapi-export.invalid",
  TYPEORM_USERNAME: "openapi-export",
  TYPEORM_PASSWORD: "openapi-export",
  TYPEORM_DATABASE: "openapi-export",
};

async function exportOpenApi(): Promise<void> {
  Object.assign(process.env, PLACEHOLDER_ENV);
  // Loaded after the placeholders: AppModule reads process.env while its decorators are evaluated.
  const { NestFactory } = await import("@nestjs/core");
  const { AppModule } = await import("../app.module");
  const { configureApiRouting } = await import("../api-routing");
  const { createSwaggerDocument } = await import("../swagger");
  const swagger = await import("@nestjs/swagger");

  const app: INestApplication = await NestFactory.create(AppModule, { preview: true, abortOnError: false, logger: ["error", "warn"] });
  try {
    configureApiRouting(app);
    const document = createSwaggerDocument(app, swagger);
    const output = join(__dirname, "..", "..", "docs", "public", "openapi.json");
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    const operations = Object.values(document.paths)
      .reduce((total, item) => total + ["get", "post", "put", "patch", "delete", "head", "options", "trace"].filter(method => method in item).length, 0);
    console.log(`OpenAPI written to ${output} (${Object.keys(document.paths).length} paths, ${operations} operations).`);
  } finally {
    await app.close();
  }
}

exportOpenApi().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
