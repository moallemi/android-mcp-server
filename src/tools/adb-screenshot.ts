import { executeAdb } from "../core/adb-executor.js";

export async function handleAdbScreenshot(args: {
  deviceId?: string;
  savePath?: string;
}): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const { deviceId } = args;
  const savePath = args.savePath || `./screenshot_${Date.now()}.png`;
  const remotePath = "/sdcard/adb_mcp_screenshot.png";

  try {
    // Capture screenshot on device
    const capture = await executeAdb({
      command: `shell screencap -p ${remotePath}`,
      deviceId,
      timeout: 15000,
    });

    if (capture.exitCode !== 0) {
      return {
        content: [{ type: "text", text: `Screenshot capture failed: ${capture.stderr.trim()}` }],
        isError: true,
      };
    }

    // Pull to local
    const pull = await executeAdb({
      command: `pull ${remotePath} ${savePath}`,
      deviceId,
      timeout: 15000,
    });

    if (pull.exitCode !== 0) {
      return {
        content: [{ type: "text", text: `Failed to pull screenshot: ${pull.stderr.trim()}` }],
        isError: true,
      };
    }

    // Clean up remote file
    await executeAdb({
      command: `shell rm ${remotePath}`,
      deviceId,
      timeout: 5000,
    }).catch(() => { /* best effort cleanup */ });

    return {
      content: [
        {
          type: "text",
          text: `Screenshot saved to: ${savePath}\n\n${pull.stdout.trim()}`,
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
