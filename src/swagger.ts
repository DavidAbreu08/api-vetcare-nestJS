import { INestApplication, Logger } from "@nestjs/common";
import { ErrorMetadata, metadataForHttpStatus } from "./app/core/enums/error-metadata.enum";

/** Optional local documentation; does not modify guards or application routes. */
export function setupSwagger(app: INestApplication): void {
  const enabled = process.env.SWAGGER_ENABLED === "true" ||
    (process.env.SWAGGER_ENABLED !== "false" && process.env.NODE_ENV !== "production");
  if (!enabled) return;

  // Load only when enabled so an unfinished local installation cannot stop the API.
  let swagger: any;
  try {
    swagger = require("@nestjs/swagger");
  } catch (error: unknown) {
    if ((error as { code?: string })?.code !== "MODULE_NOT_FOUND") throw error;
    Logger.warn("Swagger unavailable. Restore the declared dependencies with npm ci to enable /docs.", "Swagger");
    return;
  }
  const { DocumentBuilder, SwaggerModule } = swagger;
  const config = new DocumentBuilder()
    .setTitle("VetCare API")
    .setDescription("Gestão de utilizadores, animais, consultas e horários da clínica. Autenticar em POST /api/auth/login e usar o token em Authorize. Os esquemas dos DTO são preliminares; consultar os DTO da API para os campos completos.")
    .setVersion("0.0.1")
    .addBearerAuth({ type: "http", scheme: "bearer", bearerFormat: "JWT" }, "bearer")
    .addTag("Autenticação", "Login, perfil autenticado e recuperação de acesso.")
    .addTag("Utilizadores", "Contas de clientes e colaboradores.")
    .addTag("Funcionários", "Perfis de funcionário e cargos atribuídos.")
    .addTag("Perfis de acesso", "Catálogo de roles atribuídos a utilizadores.")
    .addTag("Cargos", "Catálogo de cargos profissionais.")
    .addTag("Configurações", "Configurações do sistema, incluindo os roles de sistema.")
    .addTag("Animais", "Animais e associação aos seus tutores.")
    .addTag("Reservas", "Marcações, estados e propostas de reagendamento.")
    .addTag("Horários bloqueados", "Períodos indisponíveis para marcação.")
    .build();
  const document = SwaggerModule.createDocument(app, config);
  document.components ??= {};
  document.components.schemas ??= {};
  document.components.schemas.HttpResponse = {
    type: "object",
    required: ["status", "friendlyMessage", "success", "result"],
    properties: {
      status: { type: "integer", example: 200 },
      friendlyMessage: { type: "string", example: "Operação concluída com sucesso." },
      success: { type: "boolean", example: true },
      result: { nullable: true, description: "Dados da operação; null em erros ou operações sem dados." },
      errorMetadata: { type: "string", enum: Object.values(ErrorMetadata), description: "Presente apenas em erros." },
    },
  };
  const tags: Record<string, string> = {
    auth: "Autenticação",
    users: "Utilizadores",
    employees: "Funcionários",
    roles: "Perfis de acesso",
    "job-titles": "Cargos",
    "system-settings": "Configurações",
    animal: "Animais",
    reservation: "Reservas",
    "blocked-times": "Horários bloqueados",
  };
  const publicOperations = new Set([
    "post /api/auth/login", "post /api/auth/forgot-password", "put /api/auth/reset-password",
    "post /api/users", "get /api/users/check-email",
    // Reflect the current controller; documentation does not add authentication.
    "delete /api/animal/{id}",
  ]);
  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      const operation = (pathItem as any)?.[method];
      if (!operation) continue;
      operation.tags = [tags[path.split("/")[2]] || "API"];
      operation.summary ||= `${method.toUpperCase()} ${path}`;
      operation.responses ??= {};
      for (const [status, response] of Object.entries(operation.responses)) {
        if (!/^2\d\d$/.test(status) || status === "204" || !(response as any)?.description) continue;
        const responseObject = response as any;
        const originalSchema = responseObject.content?.["application/json"]?.schema;
        responseObject.content = { "application/json": { schema: originalSchema ? {
          allOf: [
            { $ref: "#/components/schemas/HttpResponse" },
            { type: "object", properties: { result: originalSchema } },
          ],
        } : { $ref: "#/components/schemas/HttpResponse" } } };
      }
      for (const status of [400, 401, 403, 404, 409, 429, 500, 503]) {
        operation.responses[status] = {
          description: "Erro no formato global da API.",
          content: { "application/json": {
            schema: { $ref: "#/components/schemas/HttpResponse" },
            example: {
              status,
              friendlyMessage: status === 500 ? "Ocorreu um erro interno." : "Não foi possível concluir a operação.",
              success: false,
              result: null,
              errorMetadata: status === 400 ? ErrorMetadata.VALIDATION_ERROR : metadataForHttpStatus(status),
            },
          } },
        };
      }
      if (!publicOperations.has(`${method} ${path}`)) operation.security = [{ bearer: [] }];
    }
  }
  const login = document.paths["/api/auth/login"]?.post;
  if (login) {
    login.summary = "Iniciar sessão e obter token JWT";
    login.requestBody = {
      required: true,
      content: { "application/json": { schema: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", format: "password", writeOnly: true },
        },
      } } },
    };
  }
  SwaggerModule.setup("docs", app, document, {
    jsonDocumentUrl: "/docs-json",
    swaggerOptions: { persistAuthorization: false },
  });
  Logger.log("Documentation: http://localhost:3000/docs", "Swagger");
}
