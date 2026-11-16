import "reflect-metadata";
import "./environment";
import { DataSource } from "typeorm";
import { databaseOptions } from "./database.config";

export default new DataSource(databaseOptions());
