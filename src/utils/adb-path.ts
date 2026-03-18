import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { logger } from "./logger.js";

let resolvedAdbPath: string | null = null;

function findAdb(): string {
  // 1. Explicit env var takes priority
  if (process.env.ADB_PATH) {
    logger.debug(`Using ADB_PATH from env: ${process.env.ADB_PATH}`);
    return process.env.ADB_PATH;
  }

  // 2. Check ANDROID_HOME / ANDROID_SDK_ROOT
  const sdkDirs = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
  ].filter(Boolean) as string[];

  for (const sdk of sdkDirs) {
    const candidate = join(sdk, "platform-tools", "adb");
    if (existsSync(candidate)) {
      logger.debug(`Found adb via SDK env: ${candidate}`);
      return candidate;
    }
  }

  // 3. Common macOS/Linux install locations
  const home = homedir();
  const commonPaths = [
    join(home, "Library", "Android", "sdk", "platform-tools", "adb"),  // macOS default
    join(home, "Android", "Sdk", "platform-tools", "adb"),              // Linux default
    "/usr/local/bin/adb",                                                // Homebrew
    "/opt/homebrew/bin/adb",                                             // Homebrew Apple Silicon
    "/usr/bin/adb",                                                      // System
  ];

  for (const candidate of commonPaths) {
    if (existsSync(candidate)) {
      logger.debug(`Found adb at common path: ${candidate}`);
      return candidate;
    }
  }

  // 4. Try `which adb` as last resort (works if PATH is partially set)
  try {
    const result = execFileSync("which", ["adb"], {
      encoding: "utf-8",
      timeout: 3000,
    }).trim();
    if (result) {
      logger.debug(`Found adb via which: ${result}`);
      return result;
    }
  } catch {
    // which failed, fall through
  }

  // 5. Fall back to bare "adb" and let spawn fail with a clear error
  logger.warn("Could not auto-detect adb path, falling back to 'adb'");
  return "adb";
}

export function getAdbPath(): string {
  if (!resolvedAdbPath) {
    resolvedAdbPath = findAdb();
    logger.info(`ADB path resolved to: ${resolvedAdbPath}`);
  }
  return resolvedAdbPath;
}
