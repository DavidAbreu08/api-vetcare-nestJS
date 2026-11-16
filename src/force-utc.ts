/**
 * Side-effect module: forces the process timezone to UTC. It must be the FIRST import of every entry point
 * (main.ts, database/data-source.ts, database/seed-admin.ts) so that the mssql driver (useUTC:false) and every
 * Date created afterwards use a UTC wall clock; utc-datetime.ts then becomes the identity. Required, not optional.
 */
process.env.TZ = "UTC";

export {};
