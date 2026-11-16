import { config } from "dotenv";
import { databaseEnvFile } from "./database.config";

// Loaded before Nest module decorators read process.env; never reads the old .env.
config({ path: databaseEnvFile() });
