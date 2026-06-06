// Minimal structured logger. Emits one JSON line per event to stdout/stderr, which Fly
// aggregates (`fly logs`) and can ship to an external sink. Keeps the order lifecycle and
// upstream failures queryable in prod (DESIGN.md §9 observability).

type Fields = Record<string, unknown>;

function emit(level: "info" | "warn" | "error", event: string, fields: Fields = {}) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line);
  else console.log(line);
}

export const log = {
  info: (event: string, fields?: Fields) => emit("info", event, fields),
  warn: (event: string, fields?: Fields) => emit("warn", event, fields),
  error: (event: string, fields?: Fields) => emit("error", event, fields),
};
