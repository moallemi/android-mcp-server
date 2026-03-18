import { spawn, ChildProcess } from "node:child_process";
import { AdbStreamOptions, AdbStreamResult } from "../types/index.js";
import { buildAdbArgs, buildFullCommandString } from "../utils/command-builder.js";
import { logger } from "../utils/logger.js";

const DEFAULT_DURATION = 10000;
const MAX_DURATION = 60000;
const DEFAULT_MAX_LINES = 500;
const MAX_MAX_LINES = 5000;

export async function streamAdb(options: AdbStreamOptions): Promise<AdbStreamResult> {
  const {
    command,
    deviceId,
    durationMs = DEFAULT_DURATION,
    filter,
    maxLines = DEFAULT_MAX_LINES,
  } = options;

  const effectiveDuration = Math.min(durationMs, MAX_DURATION);
  const effectiveMaxLines = Math.min(maxLines, MAX_MAX_LINES);

  const adbPath = process.env.ADB_PATH || "adb";
  const args = buildAdbArgs(command, deviceId);
  const fullCommand = buildFullCommandString(command, deviceId);

  logger.info(`[ADB STREAM] ${fullCommand} (duration=${effectiveDuration}ms, maxLines=${effectiveMaxLines})`);

  return new Promise<AdbStreamResult>((resolve) => {
    const child: ChildProcess = spawn(adbPath, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const lines: string[] = [];
    let buffer = "";
    let truncated = false;
    const startTime = Date.now();

    function finish() {
      const durationMs = Date.now() - startTime;
      cleanup();
      resolve({
        output: lines.join("\n"),
        linesCollected: lines.length,
        durationMs,
        truncated,
        fullCommand,
      });
    }

    function cleanup() {
      try {
        child.kill("SIGTERM");
        setTimeout(() => {
          try {
            if (!child.killed) child.kill("SIGKILL");
          } catch { /* already dead */ }
        }, 1000);
      } catch { /* already dead */ }
    }

    const timer = setTimeout(() => {
      truncated = lines.length >= effectiveMaxLines;
      finish();
    }, effectiveDuration);

    child.stdout?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf-8");
      const parts = buffer.split("\n");
      // Keep the last partial line in buffer
      buffer = parts.pop() || "";

      for (const line of parts) {
        if (filter && !line.includes(filter)) continue;
        lines.push(line);
        if (lines.length >= effectiveMaxLines) {
          truncated = true;
          clearTimeout(timer);
          finish();
          return;
        }
      }
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (err.code === "ENOENT") {
        resolve({
          output: `Error: adb not found at "${adbPath}"`,
          linesCollected: 0,
          durationMs: Date.now() - startTime,
          truncated: false,
          fullCommand,
        });
      } else {
        resolve({
          output: `Error: ${err.message}`,
          linesCollected: 0,
          durationMs: Date.now() - startTime,
          truncated: false,
          fullCommand,
        });
      }
    });

    child.on("close", () => {
      clearTimeout(timer);
      // Process any remaining buffer
      if (buffer.trim()) {
        if (!filter || buffer.includes(filter)) {
          lines.push(buffer);
        }
      }
      resolve({
        output: lines.join("\n"),
        linesCollected: lines.length,
        durationMs: Date.now() - startTime,
        truncated: false,
        fullCommand,
      });
    });
  });
}
