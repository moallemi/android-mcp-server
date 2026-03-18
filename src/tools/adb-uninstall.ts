import { executeAdb } from "../core/adb-executor.js";

export async function handleAdbUninstall(args: {
  packageName: string;
  deviceId?: string;
  keepData?: boolean;
}): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const { packageName, deviceId, keepData = false } = args;

  try {
    const command = keepData
      ? `uninstall -k ${packageName}`
      : `uninstall ${packageName}`;

    const result = await executeAdb({
      command,
      deviceId,
      timeout: 30000,
    });

    const combined = `${result.stdout}\n${result.stderr}`;

    if (combined.includes("Success")) {
      return {
        content: [
          {
            type: "text",
            text: `$ ${result.fullCommand}\n\nPackage "${packageName}" uninstalled successfully.${keepData ? " (data/cache preserved)" : ""}`,
          },
        ],
      };
    }

    let suggestion = "";
    if (combined.includes("Unknown package") || combined.includes("DELETE_FAILED_INTERNAL_ERROR")) {
      suggestion = `\n\nPackage "${packageName}" may not be installed, or is a system app that cannot be uninstalled. Use \`adb shell pm list packages\` to verify.`;
    } else if (combined.includes("DELETE_FAILED_DEVICE_POLICY_MANAGER")) {
      suggestion = "\n\nThis app is a device admin. Remove it as device admin in Settings > Security before uninstalling.";
    } else if (combined.includes("DELETE_FAILED_INTERNAL_ERROR")) {
      suggestion = "\n\nInternal error. The package may be a system app that cannot be uninstalled. Try `adb shell pm disable-user` instead.";
    }

    return {
      content: [
        {
          type: "text",
          text: `$ ${result.fullCommand}\n\nUninstall failed.\n${combined.trim()}${suggestion}`,
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
