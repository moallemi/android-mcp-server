import { getAdbPath } from "./adb-path.js";

/**
 * Tokenize a command string into arguments, respecting quotes.
 * e.g., `shell echo "hello world"` → ["shell", "echo", "hello world"]
 */
export function tokenizeCommand(command: string): string[] {
  const args: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let escape = false;

  for (const char of command) {
    if (escape) {
      current += char;
      escape = false;
      continue;
    }

    if (char === "\\") {
      escape = true;
      continue;
    }

    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }

    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }

    if (char === " " && !inSingle && !inDouble) {
      if (current.length > 0) {
        args.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    args.push(current);
  }

  return args;
}

/**
 * Build the full adb args array, prepending -s <serial> if needed.
 */
export function buildAdbArgs(
  command: string,
  deviceId?: string
): string[] {
  const args: string[] = [];
  if (deviceId) {
    args.push("-s", deviceId);
  }
  args.push(...tokenizeCommand(command));
  return args;
}

/**
 * Build the full command string for display/debugging.
 */
export function buildFullCommandString(
  command: string,
  deviceId?: string
): string {
  const adbPath = getAdbPath();
  const parts = [adbPath];
  if (deviceId) {
    parts.push("-s", deviceId);
  }
  parts.push(command);
  return parts.join(" ");
}
