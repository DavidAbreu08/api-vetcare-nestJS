// Must stay the first import: forces process.env.TZ = "UTC" before anything creates dates or loads TypeORM.
import "../force-utc";
import "reflect-metadata";
import "./environment";
import { DataSource } from "typeorm";
import { databaseOptions } from "./database.config";

export default new DataSource(databaseOptions());
