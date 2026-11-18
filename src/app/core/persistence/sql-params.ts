import { MssqlParameter } from "typeorm";
import { dateKey } from "../../reservation/reservation-policy";
import { toDbUtc } from "./utc-datetime";

/**
 * Typed parameters for raw SQL (EntityManager.query). Untyped values are inferred by the mssql driver:
 * a Date would travel as legacy datetime (1/300 s rounding), which could move an instant into the next second.
 */
export const utcInstantParam = (instant: Date) => new MssqlParameter(toDbUtc(instant), "datetime2", 7);
export const uuidParam = (id: string) => new MssqlParameter(id, "uniqueidentifier");
/** Clinic calendar date (YYYY-MM-DD, validated) as a SQL date; the driver parses it at UTC midnight (process TZ is UTC). */
export const clinicDateParam = (date: string) => new MssqlParameter(dateKey(date), "date");
