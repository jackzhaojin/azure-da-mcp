import { startAgentServer } from "@agents/a2a-common";
import { migrationExecutor } from "./executor.ts";

startAgentServer({
  name: "da-migration-agent",
  description:
    "Migrates a source (PDF/webpage, incl. synthetic) into a da.live EDS page with self-validation. Facade over swappable backends: makecom (primary, pending tunnel), sdk (M3), opencode (M3+), dryrun (simulation).",
  port: Number(process.env.PORT ?? 4003),
  dbPath: process.env.STORE_DB_PATH ?? "./data/store.db",
  shimAgentId: "migration",
  skills: [
    {
      id: "migration.run",
      name: "Migrate page",
      description: "Author a source into da.live and validate the preview. Payload contract: migration.run.v1",
      tags: ["migration", "da.live", "eds"],
      inputModes: ["application/json"],
      outputModes: ["application/json"],
    },
  ],
  executor: migrationExecutor,
});
