import { spawn } from "node:child_process";
import { AdbExecOptions, AdbExecResult } from "../types/index.js";
import { buildAdbArgs, buildFullCommandString } from "../utils/command-builder.js";
import { getAdbPath } from "../utils/adb-path.js";
import { logger } from "../utils/logger.js";

const DEFAULT_TIMEOUT = parseInt(process.env.ADB_DEFAULT_TIMEOUT || "30000", 10);
const MAX_BUFFER = 50 * 1024 * 1024; // 50MB for large outputs like bugreport

export async function executeAdb(options: AdbExecOptions): Promise<AdbExecResult> {
  const {
    command,
    deviceId,
    timeout = DEFAULT_TIMEOUT,
    signal,
  } = options;

  const adbPath = getAdbPath();
  const args = buildAdbArgs(command, deviceId);
  const fullCommand = buildFullCommandString(command, deviceId);

  logger.info(`[ADB] ${fullCommand}`);

  const startTime = Date.now();

  return new Promise<AdbExecResult>((resolve, reject) => {
    const child = spawn(adbPath, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let totalSize = 0;
    let killed = false;

    child.stdout.on("data", (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize <= MAX_BUFFER) {
        stdoutChunks.push(chunk);
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    // Timeout handling
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (timeout > 0) {
      timer = setTimeout(() => {
        killed = true;
        child.kill("SIGTERM");
        // Give it a moment, then force kill
        setTimeout(() => {
          if (!child.killed) child.kill("SIGKILL");
        }, 2000);
      }, timeout);
    }

    // AbortSignal handling
    if (signal) {
      signal.addEventListener("abort", () => {
        killed = true;
        child.kill("SIGTERM");
      }, { once: true });
    }

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (timer) clearTimeout(timer);

      if (err.code === "ENOENT") {
        reject(
          new Error(
            `adb not found at "${adbPath}". Install Android SDK platform-tools and ensure adb is in your PATH.`
          )
        );
      } else {
        reject(err);
      }
    });

    child.on("close", (code) => {
      if (timer) clearTimeout(timer);

      const durationMs = Date.now() - startTime;
      const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
      const stderr = Buffer.concat(stderrChunks).toString("utf-8");

      if (killed && code !== 0) {
        resolve({
          stdout,
          stderr: stderr || "Command timed out",
          exitCode: code ?? 1,
          fullCommand,
          durationMs,
        });
        return;
      }

      resolve({
        stdout,
        stderr,
        exitCode: code ?? 0,
        fullCommand,
        durationMs,
      });
    });
  });
}
