type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const configuredLevel: LogLevel =
  (process.env.ADB_MCP_LOG_LEVEL as LogLevel) || "info";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[configuredLevel];
}

// All logging goes to stderr to avoid interfering with stdio MCP transport
export const logger = {
  debug: (...args: unknown[]) => {
    if (shouldLog("debug")) process.stderr.write(`[DEBUG] ${args.join(" ")}\n`);
  },
  info: (...args: unknown[]) => {
    if (shouldLog("info")) process.stderr.write(`[INFO] ${args.join(" ")}\n`);
  },
  warn: (...args: unknown[]) => {
    if (shouldLog("warn")) process.stderr.write(`[WARN] ${args.join(" ")}\n`);
  },
  error: (...args: unknown[]) => {
    if (shouldLog("error")) process.stderr.write(`[ERROR] ${args.join(" ")}\n`);
  },
};
