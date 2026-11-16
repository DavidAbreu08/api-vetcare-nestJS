import { applyDecorators } from "@nestjs/common";
import { Transform } from "class-transformer";
import { IsDateString, IsEmail, IsString, Matches, MaxLength } from "class-validator";
import { normalizeEmail } from "../../core/catalog";
import { RegExHelper } from "../../helpers/regex.helper";

const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

/** Shared validation for account fields; nullability is decided by each DTO (IsOptional). */
export const AccountField = {
  name: () => applyDecorators(Transform(trim), IsString(), Matches(/\S/), MaxLength(150)),
  /** Trimmed and lowercased before validation. */
  email: () => applyDecorators(Transform(({ value }: { value: unknown }) => normalizeEmail(value)), IsEmail(), MaxLength(255)),
  phone: () => applyDecorators(Transform(trim), IsString(), Matches(RegExHelper.phoneRegex, { message: "Phone number must be 9 digits and only contain numbers" })),
  /** Nine-digit string; numbers are rejected so leading zeros are never lost. */
  nif: () => applyDecorators(Transform(trim), IsString(), Matches(/^\d{9}$/, { message: "NIF must be a string of 9 digits" })),
  /** ISO date only (YYYY-MM-DD). */
  birthDate: () => applyDecorators(IsDateString({ strict: true }), Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "birthDate must use YYYY-MM-DD" })),
  profilePictureUrl: () => applyDecorators(IsString(), MaxLength(500)),
};
