import type { MediaTypeObject, OpenAPIObject, ReferenceObject, SchemaObject, TagObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import { ErrorMetadata, metadataForHttpStatus } from "./app/core/enums/error-metadata.enum";

export const SWAGGER_TAGS: TagObject[] = [
  { name: "Autenticação", description: "Sessão, perfil autenticado e recuperação de acesso." },
  { name: "Utilizadores", description: "Contas de clientes e colaboradores." },
  { name: "Funcionários", description: "Perfis de funcionário, disponibilidade e cargos atribuídos." },
  { name: "Perfis de acesso", description: "Catálogo de perfis de acesso dos utilizadores." },
  { name: "Cargos", description: "Catálogo de cargos profissionais." },
  { name: "Animais", description: "Registo, consulta e aprovação de animais." },
  { name: "Tutores", description: "Associação de tutores e transferência da tutoria principal." },
  { name: "Espécies", description: "Catálogo de espécies." },
  { name: "Raças", description: "Catálogo de raças por espécie." },
  { name: "Medições", description: "Histórico de medições dos animais." },
  { name: "Tipos de medição", description: "Tipos, unidades e precisão das medições." },
  { name: "Reservas", description: "Marcações, estados, histórico e reagendamentos." },
  { name: "Consultas clínicas", description: "Registo, conclusão e anulação de consultas clínicas." },
  { name: "Horários bloqueados", description: "Períodos indisponíveis para marcação." },
  { name: "Clínica", description: "Horários e política pública de funcionamento." },
  { name: "Configurações", description: "Configurações e perfis de sistema." },
];

const METHODS = ["get", "post", "put", "patch", "delete", "head", "options", "trace"] as const;
const SUCCESS_REF = "#/components/schemas/HttpSuccessResponse";
const ERROR_REF = "#/components/schemas/HttpErrorResponse";

function isEnvelope(schema: SchemaObject | ReferenceObject | undefined): boolean {
  if (!schema) return false;
  if ("$ref" in schema) return [SUCCESS_REF, ERROR_REF].includes(schema.$ref);
  return !!schema.properties?.friendlyMessage || !!schema.allOf?.some(isEnvelope);
}

function successExample(value: unknown, status: number): unknown {
  if (value && typeof value === "object" && "friendlyMessage" in value && "success" in value) return value;
  return { status, friendlyMessage: "Operação concluída com sucesso.", success: true, result: value ?? null };
}

function wrapSuccess(media: MediaTypeObject, status: number): void {
  if (isEnvelope(media.schema)) return;
  const original = media.schema;
  media.schema = original ? {
    allOf: [
      { $ref: SUCCESS_REF },
      { type: "object", properties: { result: original } },
    ],
  } : { $ref: SUCCESS_REF };
  if (media.example !== undefined) media.example = successExample(media.example, status);
  if (media.examples) {
    for (const example of Object.values(media.examples)) {
      if (!("$ref" in example) && "value" in example) example.value = successExample(example.value, status);
    }
  }
}

/** Formats documentation only; route and authentication metadata belong to controllers. */
export function prepareSwaggerDocument(document: OpenAPIObject): OpenAPIObject {
  document.components ??= {};
  document.components.schemas ??= {};
  const common = {
    status: { type: "integer", description: "Igual ao estado HTTP da resposta." },
    friendlyMessage: { type: "string", description: "Mensagem pública adequada ao contexto da operação." },
  } satisfies Record<string, SchemaObject>;
  document.components.schemas.HttpSuccessResponse = {
    type: "object",
    required: ["status", "friendlyMessage", "success", "result"],
    properties: {
      ...common,
      status: { ...common.status, example: 200 },
      friendlyMessage: { ...common.friendlyMessage, example: "Operação concluída com sucesso." },
      success: { type: "boolean", enum: [true] },
      result: { nullable: true, description: "Dados devolvidos pela operação; null quando não existem dados." },
    },
  };
  document.components.schemas.HttpErrorResponse = {
    type: "object",
    required: ["status", "friendlyMessage", "success", "result", "errorMetadata"],
    properties: {
      ...common,
      status: { ...common.status, example: 404 },
      friendlyMessage: { ...common.friendlyMessage, example: "Recurso não encontrado." },
      success: { type: "boolean", enum: [false] },
      result: { type: "object", nullable: true, enum: [null], description: "Sempre null em respostas de erro." },
      errorMetadata: { type: "string", enum: Object.values(ErrorMetadata), example: ErrorMetadata.NOT_FOUND },
    },
  };

  for (const pathItem of Object.values(document.paths)) {
    for (const method of METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;
      operation.responses[500] ??= { description: "Ocorreu um erro interno." };
      const security = operation.security ?? document.security;
      if (security?.some(requirement => Object.keys(requirement).length > 0)) {
        operation.responses[401] ??= { description: "Autenticação necessária ou sessão inválida." };
        operation.responses[403] ??= { description: "Sem permissão para realizar esta operação." };
      }
      for (const [status, response] of Object.entries(operation.responses)) {
        if (!response || "$ref" in response || method === "head" || ["204", "304"].includes(status)) continue;
        const statusCode = Number(status);
        if (statusCode >= 200 && statusCode < 300) {
          // Explicit file/stream media types must not acquire a JSON response envelope.
          if (!response.content || !Object.keys(response.content).length) response.content = { "application/json": {} };
          const json = response.content["application/json"];
          if (json && !(json.schema && !("$ref" in json.schema) && json.schema.format === "binary")) wrapSuccess(json, statusCode);
        } else if (statusCode >= 400 && statusCode <= 599) {
          if (!response.content || !Object.keys(response.content).length) response.content = { "application/json": {} };
          const json = response.content["application/json"];
          // Explicit domain schemas/examples remain owned by the controller declaring them.
          if (json && !json.schema) json.schema = { $ref: ERROR_REF };
          if (json && json.example === undefined && !json.examples) {
            json.example = {
              status: statusCode,
              friendlyMessage: response.description || "Não foi possível concluir a operação.",
              success: false,
              result: null,
              errorMetadata: metadataForHttpStatus(statusCode),
            };
          }
        }
      }
    }
  }
  return document;
}
