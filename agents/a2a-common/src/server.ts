import express from "express";
import type { AgentCard, AgentSkill } from "@a2a-js/sdk";
import { DefaultRequestHandler, type AgentExecutor } from "@a2a-js/sdk/server";
import { agentCardHandler, jsonRpcHandler, UserBuilder } from "@a2a-js/sdk/server/express";
import { openDb } from "./store/db.ts";
import { SqliteTaskStore } from "./store/taskStore.ts";
import { createLogger } from "./logging.ts";

export interface AgentServerOptions {
  /** Short agent name, e.g. "da-eval-agent" — also tags rows in the tasks table. */
  name: string;
  description: string;
  port: number;
  skills: AgentSkill[];
  executor: AgentExecutor;
  /** Path to the local SQLite file (default: ./data/store.db relative to cwd). */
  dbPath?: string;
}

/**
 * Shared A2A server bootstrap (PRD part-3): Express + official SDK handlers,
 * Agent Card at /.well-known/agent-card.json, JSON-RPC (incl. SSE streaming)
 * at /a2a, /health, and the SQLite-backed task store.
 *
 * Each agent is ~50 lines of executor + skills on top of this.
 */
export function startAgentServer(opts: AgentServerOptions) {
  const log = createLogger(opts.name);
  const db = openDb(opts.dbPath ?? "./data/store.db");
  const taskStore = new SqliteTaskStore(db, opts.name);

  const card: AgentCard = {
    protocolVersion: "0.3.0",
    name: opts.name,
    description: opts.description,
    url: `http://localhost:${opts.port}/a2a`,
    preferredTransport: "JSONRPC",
    version: "0.1.0",
    capabilities: { streaming: true, pushNotifications: false },
    defaultInputModes: ["application/json", "text/plain"],
    defaultOutputModes: ["application/json"],
    skills: opts.skills,
  };

  const requestHandler = new DefaultRequestHandler(card, taskStore, opts.executor);

  const app = express();
  app.use(
    "/.well-known/agent-card.json",
    agentCardHandler({ agentCardProvider: requestHandler })
  );
  app.use(
    "/a2a",
    jsonRpcHandler({ requestHandler, userBuilder: UserBuilder.noAuthentication })
  );
  app.get("/health", (_req, res) => {
    res.json({ ok: true, agent: opts.name, ts: new Date().toISOString() });
  });

  const server = app.listen(opts.port, () => {
    log.info("agent server up", {
      port: opts.port,
      card: `http://localhost:${opts.port}/.well-known/agent-card.json`,
      skills: opts.skills.map((s) => s.id),
    });
  });

  return { app, server, db, log, card };
}
