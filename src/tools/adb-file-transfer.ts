import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { executeAdb } from "../core/adb-executor.js";

export async function handleAdbFileTransfer(args: {
  direction: "push" | "pull";
  localPath: string;
  remotePath: string;
  deviceId?: string;
}): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const { direction, localPath, remotePath, deviceId } = args;

  if (direction === "push" && !existsSync(localPath)) {
    return {
      content: [
        {
          type: "text",
          text: `Error: Local file not found at "${localPath}"`,
        },
      ],
      isError: true,
    };
  }

  if (direction === "pull") {
    const dir = dirname(localPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  try {
    const command =
      direction === "push"
        ? `push ${localPath} ${remotePath}`
        : `pull ${remotePath} ${localPath}`;

    const result = await executeAdb({
      command,
      deviceId,
      timeout: 120000,
    });

    if (result.exitCode !== 0) {
      return {
        content: [
          {
            type: "text",
            text: `$ ${result.fullCommand}\n\nTransfer failed: ${result.stderr.trim()}`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `$ ${result.fullCommand}\n\n${result.stdout.trim() || "Transfer complete."}`,
        },
      ],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    };
  }
}
