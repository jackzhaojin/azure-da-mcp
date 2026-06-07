import express from "express";
import type { AgentCard, AgentSkill, Task } from "@a2a-js/sdk";
import {
  DefaultRequestHandler,
  DefaultPushNotificationSender,
  type AgentExecutor,
} from "@a2a-js/sdk/server";
import { agentCardHandler, jsonRpcHandler, UserBuilder } from "@a2a-js/sdk/server/express";
import { randomUUID } from "node:crypto";
import { openDb } from "./store/db.ts";
import { SqliteTaskStore } from "./store/taskStore.ts";
import { SqlitePushNotificationStore } from "./store/pushStore.ts";
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
  /** Extra fields merged into the /health response (queue depth, semaphore stats, …). */
  healthExtras?: () => Record<string, unknown>;
  /**
   * Short id for the edge-shim route, e.g. "eval" → POST /hooks/eval/{skill}.
   * Defaults to the agent name with the "da-"/"-agent" affixes stripped.
   */
  shimAgentId?: string;
}

function bearerToken(req: express.Request): string | undefined {
  const header = req.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
}

/**
 * Shared A2A server bootstrap (PRD part-3): Express + official SDK handlers.
 *
 * - Agent Card at /.well-known/agent-card.json (public)
 * - JSON-RPC incl. SSE streaming at /a2a — bearer-gated when A2A_MESH_TOKEN is set
 * - Push notifications: SQLite-backed config store + SDK sender (webhooks out)
 * - Edge webhook shim at POST /hooks/{agent}/{skill} — flat JSON + callbackUrl
 *   in, 202 {taskId} out (the Make.com / curl / cron surface, PRD part-3)
 * - /health (public)
 */
export function startAgentServer(opts: AgentServerOptions) {
  const log = createLogger(opts.name);
  const db = openDb(opts.dbPath ?? "./data/store.db");
  const taskStore = new SqliteTaskStore(db, opts.name);
  const pushStore = new SqlitePushNotificationStore(db);
  const pushSender = new DefaultPushNotificationSender(pushStore);
  const meshToken = process.env.A2A_MESH_TOKEN || undefined;
  const edgeToken = process.env.A2A_EDGE_TOKEN || meshToken;
  const shimAgentId = opts.shimAgentId ?? opts.name.replace(/^da-/, "").replace(/-agent$/, "");

  const card: AgentCard = {
    protocolVersion: "0.3.0",
    name: opts.name,
    description: opts.description,
    url: `http://localhost:${opts.port}/a2a`,
    preferredTransport: "JSONRPC",
    version: "0.1.0",
    capabilities: { streaming: true, pushNotifications: true },
    defaultInputModes: ["application/json", "text/plain"],
    defaultOutputModes: ["application/json"],
    skills: opts.skills,
    ...(meshToken ? { securitySchemes: { bearer: { type: "http", scheme: "bearer" } } } : {}),
  };

  const requestHandler = new DefaultRequestHandler(
    card,
    taskStore,
    opts.executor,
    undefined, // default event bus manager
    pushStore,
    pushSender
  );

  const app = express();
  app.use(
    "/.well-known/agent-card.json",
    agentCardHandler({ agentCardProvider: requestHandler })
  );

  // mesh auth: shared-secret bearer on the A2A surface (PRD part-3). Disabled when
  // no token is configured — dev default is an open localhost mesh.
  if (meshToken) {
    app.use("/a2a", (req, res, next) => {
      if (bearerToken(req) === meshToken) return next();
      res.status(401).json({ error: "unauthorized: bearer token required" });
    });
  }
  app.use(
    "/a2a",
    jsonRpcHandler({ requestHandler, userBuilder: UserBuilder.noAuthentication })
  );

  // Edge webhook shim: one flat POST for external callers; full A2A stays internal.
  //   POST /hooks/{agent}/{skill}  body: { ...skillPayload, callbackUrl?, callbackToken? }
  //   → 202 { taskId, contextId }; result arrives at callbackUrl as an A2A push
  //   notification (a plain webhook POST of the Task object).
  app.post("/hooks/:agent/:skill", express.json({ limit: "2mb" }), async (req, res) => {
    if (edgeToken && bearerToken(req) !== edgeToken) {
      return res.status(401).json({ error: "unauthorized: bearer token required" });
    }
    const { agent, skill } = req.params;
    if (agent !== shimAgentId) {
      return res.status(404).json({ error: `unknown agent '${agent}' — this origin serves '${shimAgentId}'` });
    }
    if (!opts.skills.some((s) => s.id === skill)) {
      return res
        .status(404)
        .json({ error: `unknown skill '${skill}' — available: ${opts.skills.map((s) => s.id).join(", ")}` });
    }
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ error: "JSON object body required" });
    }
    const { callbackUrl, callbackToken, ...payload } = req.body as Record<string, unknown>;

    try {
      const result = await requestHandler.sendMessage({
        message: {
          kind: "message",
          messageId: randomUUID(),
          role: "user",
          parts: [{ kind: "data", data: payload }],
        },
        configuration: {
          blocking: false,
          ...(typeof callbackUrl === "string"
            ? {
                pushNotificationConfig: {
                  url: callbackUrl,
                  ...(typeof callbackToken === "string" ? { token: callbackToken } : {}),
                },
              }
            : {}),
        },
      });
      const task = result as Task;
      log.info("edge shim accepted task", { skill, a2a_task_id: task.id, callback: callbackUrl ?? "none" });
      res.status(202).json({ taskId: task.id, contextId: task.contextId, state: task.status?.state });
    } catch (err) {
      log.error("edge shim error", { skill, error: String(err) });
      res.status(500).json({ error: String(err) });
    }
  });

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      agent: opts.name,
      ts: new Date().toISOString(),
      ...(opts.healthExtras?.() ?? {}),
    });
  });

  const server = app.listen(opts.port, () => {
    log.info("agent server up", {
      port: opts.port,
      card: `http://localhost:${opts.port}/.well-known/agent-card.json`,
      skills: opts.skills.map((s) => s.id),
      auth: meshToken ? "bearer" : "open",
      shim: `/hooks/${shimAgentId}/{skill}`,
    });
  });

  return { app, server, db, log, card, requestHandler };
}
