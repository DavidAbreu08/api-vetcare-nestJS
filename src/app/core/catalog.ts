/** Shared rules for catalog codes: uppercase letters, digits and underscores, starting with a letter. */
export const CATALOG_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;

export function normalizeCatalogCode(value: unknown): unknown {
  return typeof value === "string" ? value.trim().toUpperCase() : value;
}

/** Trims and lowercases emails so uniqueness and lookups agree. */
export function normalizeEmail(value: unknown): unknown {
  return typeof value === "string" ? value.trim().toLowerCase() : value;
}

/** Normalizes UUIDs for comparisons; SQL Server returns uniqueidentifier in uppercase. */
export function normalizeId(value: string): string {
  return value.trim().toLowerCase();
}

/** Calendar date (YYYY-MM-DD) for today in the given IANA timezone. */
export function todayKey(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export type CatalogInput = { code?: string; name?: string; isActive?: boolean; description?: string | null; notes?: string | null };

/** Validates and normalizes writable catalog attributes; omitted fields stay untouched. */
export function catalogAttributes(dto: CatalogInput, invalid: () => Error): CatalogInput {
  const result: CatalogInput = {};
  if (dto.code !== undefined) {
    const code = normalizeCatalogCode(dto.code);
    if (typeof code !== "string" || code.length > 64 || !CATALOG_CODE_PATTERN.test(code)) throw invalid();
    result.code = code;
  }
  if (dto.name !== undefined) {
    if (typeof dto.name !== "string" || !dto.name.trim()) throw invalid();
    result.name = dto.name.trim();
  }
  if (dto.isActive !== undefined) {
    if (typeof dto.isActive !== "boolean") throw invalid();
    result.isActive = dto.isActive;
  }
  if (dto.description !== undefined) result.description = dto.description;
  if (dto.notes !== undefined) result.notes = dto.notes;
  return result;
}

export type CatalogSummary = { id: string; code: string; name: string };

export function catalogSummary(entry: { id: string; code: string; name: string }): CatalogSummary {
  return { id: entry.id, code: entry.code, name: entry.name };
}
