/** Structured log lines with a2a_task_id + context_id on every line (PRD part-3 telemetry rule). */
export function createLogger(agent: string) {
  function line(level: string, msg: string, fields: Record<string, unknown> = {}) {
    const base: Record<string, unknown> = {
      ts: new Date().toISOString(),
      agent,
      level,
      msg,
      ...fields,
    };
    console.log(JSON.stringify(base));
  }
  return {
    info: (msg: string, fields?: Record<string, unknown>) => line("info", msg, fields),
    warn: (msg: string, fields?: Record<string, unknown>) => line("warn", msg, fields),
    error: (msg: string, fields?: Record<string, unknown>) => line("error", msg, fields),
  };
}

export type Logger = ReturnType<typeof createLogger>;
