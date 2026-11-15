import { join } from "path";
import { SqlServerConnectionOptions } from "typeorm/driver/sqlserver/SqlServerConnectionOptions";

export function databaseEnvFile(): string {
  return process.env.VETCARE_ENV_FILE || ".env.mssql.local";
}

export function databaseOptions(): SqlServerConnectionOptions {
  if (process.env.TYPEORM_CONNECTION !== "mssql") {
    throw new Error("Configure TYPEORM_CONNECTION=mssql in .env.mssql.local (or VETCARE_ENV_FILE).");
  }
  for (const name of ["TYPEORM_HOST", "TYPEORM_USERNAME", "TYPEORM_PASSWORD", "TYPEORM_DATABASE"]) {
    if (!process.env[name]?.trim()) throw new Error(`Missing required configuration: ${name}`);
  }
  const port = Number(process.env.TYPEORM_PORT || 1433);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("TYPEORM_PORT must be a valid TCP port.");
  }
  return {
    type: "mssql",
    host: process.env.TYPEORM_HOST,
    port,
    username: process.env.TYPEORM_USERNAME,
    password: process.env.TYPEORM_PASSWORD,
    database: process.env.TYPEORM_DATABASE,
    schema: "dbo",
    entities: [join(__dirname, "../**/*.entity{.ts,.js}")],
    migrations: [join(__dirname, "migrations/*{.ts,.js}")],
    synchronize: false,
    migrationsRun: false,
    options: {
      encrypt: process.env.TYPEORM_ENCRYPT !== "false",
      trustServerCertificate: process.env.TYPEORM_TRUST_SERVER_CERTIFICATE === "true",
      useUTC: false,
    },
  };
}
