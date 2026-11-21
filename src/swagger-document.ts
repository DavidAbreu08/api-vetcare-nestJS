import type { MediaTypeObject, OpenAPIObject, ReferenceObject, SchemaObject, TagObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import { ErrorMetadata, metadataForHttpStatus } from "./app/core/enums/error-metadata.enum";

export const SWAGGER_TAGS: TagObject[] = [
  { name: "Authentication", description: "Sessions, authenticated profiles and account recovery." },
  { name: "Users", description: "Client and staff accounts." },
  { name: "Employees", description: "Employee profiles, availability and assigned job titles." },
  { name: "Roles", description: "User access role catalog." },
  { name: "Job Titles", description: "Professional job title catalog." },
  { name: "Animals", description: "Animal registration, records and approval." },
  { name: "Animal Owners", description: "Animal owner associations and primary ownership transfers." },
  { name: "Species", description: "Species catalog." },
  { name: "Breeds", description: "Breed catalog by species." },
  { name: "Animal Measurements", description: "Animal measurement history." },
  { name: "Measurement Types", description: "Measurement types, units and precision." },
  { name: "Reservations", description: "Bookings, statuses, history and rescheduling." },
  { name: "Clinical Visits", description: "Clinical visit records, completion and voiding." },
  { name: "Blocked Times", description: "Time periods unavailable for booking." },
  { name: "Availability", description: "Indicative free appointment slots per qualified employee." },
  { name: "Clinic", description: "Public opening hours and operating policy." },
  { name: "Services", description: "Clinic services catalog and qualified employees." },
  { name: "System Settings", description: "System configuration and roles." },
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
  return { status, friendlyMessage: "Operation completed successfully.", success: true, result: value ?? null };
}

function resultExample(schema: SchemaObject | ReferenceObject | undefined, document: OpenAPIObject): unknown {
  if (!schema) return {};
  if ("$ref" in schema) {
    const referenced = document.components?.schemas?.[schema.$ref.split("/").pop()!];
    return referenced && !("$ref" in referenced) ? resultExample(referenced, document) : {};
  }
  if (schema.example !== undefined) return schema.example;
  if (schema.enum?.length) return schema.enum[0];
  switch (schema.type) {
    case "array": return [];
    case "boolean": return false;
    case "integer":
    case "number": return 0;
    case "string": return "";
    default: return {};
  }
}

function wrapSuccess(media: MediaTypeObject, status: number, document: OpenAPIObject): void {
  if (isEnvelope(media.schema)) {
    if (media.example === undefined && !media.examples) media.example = successExample({}, status);
    return;
  }
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
  if (media.example === undefined && !media.examples) media.example = successExample(resultExample(original, document), status);
}

/** Formats documentation only; route and authentication metadata belong to controllers. */
export function prepareSwaggerDocument(document: OpenAPIObject): OpenAPIObject {
  document.components ??= {};
  document.components.schemas ??= {};
  const common = {
    status: { type: "integer", description: "Matches the HTTP response status." },
    friendlyMessage: { type: "string", description: "Public message appropriate to the operation context." },
  } satisfies Record<string, SchemaObject>;
  document.components.schemas.HttpSuccessResponse = {
    type: "object",
    required: ["status", "friendlyMessage", "success", "result"],
    properties: {
      ...common,
      status: { ...common.status, example: 200 },
      friendlyMessage: { ...common.friendlyMessage, example: "Operation completed successfully." },
      success: { type: "boolean", enum: [true] },
      result: { nullable: true, description: "Operation data; null when no data is returned." },
    },
  };
  document.components.schemas.HttpErrorResponse = {
    type: "object",
    required: ["status", "friendlyMessage", "success", "result", "errorMetadata"],
    properties: {
      ...common,
      status: { ...common.status, example: 404 },
      friendlyMessage: { ...common.friendlyMessage, example: "Resource not found." },
      success: { type: "boolean", enum: [false] },
      result: { type: "object", nullable: true, enum: [null], description: "Always null in error responses." },
      errorMetadata: { type: "string", enum: Object.values(ErrorMetadata), example: ErrorMetadata.NOT_FOUND },
    },
  };

  for (const pathItem of Object.values(document.paths)) {
    for (const method of METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;
      operation.responses[500] ??= { description: "An internal error occurred." };
      const security = operation.security ?? document.security;
      if (security?.some(requirement => Object.keys(requirement).length > 0)) {
        operation.responses[401] ??= { description: "Authentication required or invalid session." };
        operation.responses[403] ??= { description: "You do not have permission to perform this operation." };
      }
      for (const [status, response] of Object.entries(operation.responses)) {
        if (!response || "$ref" in response || method === "head" || ["204", "304"].includes(status)) continue;
        const statusCode = Number(status);
        if (statusCode >= 200 && statusCode < 300) {
          // Explicit file/stream media types must not acquire a JSON response envelope.
          if (!response.content || !Object.keys(response.content).length) response.content = { "application/json": {} };
          const json = response.content["application/json"];
          if (json && !(json.schema && !("$ref" in json.schema) && json.schema.format === "binary")) wrapSuccess(json, statusCode, document);
        } else if (statusCode >= 400 && statusCode <= 599) {
          if (!response.content || !Object.keys(response.content).length) response.content = { "application/json": {} };
          const json = response.content["application/json"];
          // Explicit domain schemas/examples remain owned by the controller declaring them.
          if (json && !json.schema) json.schema = { $ref: ERROR_REF };
          if (json && json.example === undefined && !json.examples) {
            json.example = {
              status: statusCode,
              friendlyMessage: response.description || "The operation could not be completed.",
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
