import { existsSync } from "node:fs";
import { executeAdb } from "../core/adb-executor.js";
import { mapInstallError } from "../utils/error-mapper.js";

export async function handleAdbInstall(args: {
  apkPath: string;
  deviceId?: string;
  options?: string[];
}): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const { apkPath, deviceId, options = ["-r", "-t"] } = args;

  if (!existsSync(apkPath)) {
    return {
      content: [
        {
          type: "text",
          text: `Error: APK file not found at "${apkPath}"`,
        },
      ],
      isError: true,
    };
  }

  try {
    const flags = options.join(" ");
    const command = `install ${flags} ${apkPath}`;
    const result = await executeAdb({
      command,
      deviceId,
      timeout: 120000, // Installs can be slow
    });

    const combined = `${result.stdout}\n${result.stderr}`;

    if (combined.includes("Success")) {
      return {
        content: [
          {
            type: "text",
            text: `$ ${result.fullCommand}\n\nAPK installed successfully.\n\n[duration: ${result.durationMs}ms]`,
          },
        ],
      };
    }

    const installError = mapInstallError(combined);
    return {
      content: [
        {
          type: "text",
          text: `$ ${result.fullCommand}\n\nInstall failed.\n${combined.trim()}${installError ? `\n\nSuggestion: ${installError}` : ""}`,
        },
      ],
      isError: true,
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
