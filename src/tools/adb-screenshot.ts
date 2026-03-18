import { readFileSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeAdb } from "../core/adb-executor.js";

type ContentItem =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: "image/png" };

export async function handleAdbScreenshot(args: {
  deviceId?: string;
  savePath?: string;
}): Promise<{ content: ContentItem[]; isError?: boolean }> {
  const { deviceId, savePath } = args;
  const remotePath = "/sdcard/adb_mcp_screenshot.png";
  // Always pull to a temp file first for base64 encoding
  const tempPath = join(tmpdir(), `adb_mcp_screenshot_${Date.now()}.png`);

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

    // Pull to temp path
    const pullTarget = savePath || tempPath;
    const pull = await executeAdb({
      command: `pull ${remotePath} ${pullTarget}`,
      deviceId,
      timeout: 15000,
    });

    if (pull.exitCode !== 0) {
      return {
        content: [{ type: "text", text: `Failed to pull screenshot: ${pull.stderr.trim()}` }],
        isError: true,
      };
    }

    // Read the file and encode as base64
    const imageBuffer = readFileSync(pullTarget);
    const base64Image = imageBuffer.toString("base64");

    // Clean up remote file and get screen resolution in parallel
    const [, sizeResult] = await Promise.all([
      executeAdb({
        command: `shell rm ${remotePath}`,
        deviceId,
        timeout: 5000,
      }).catch(() => {}),
      executeAdb({
        command: "shell wm size",
        deviceId,
        timeout: 5000,
      }).catch(() => null),
    ]);

    // Clean up temp file if no savePath was requested
    if (!savePath && existsSync(tempPath)) {
      unlinkSync(tempPath);
    }

    let resolutionInfo = "";
    if (sizeResult && sizeResult.exitCode === 0) {
      const match = sizeResult.stdout.match(/(\d+)x(\d+)/);
      if (match) {
        resolutionInfo = `\nDevice screen resolution: ${match[1]}x${match[2]} pixels\nIMPORTANT: Use these pixel dimensions for any \`input tap\` or \`adb_tap\` coordinates — the screenshot image may be scaled down from the actual device resolution.`;
      }
    }

    const content: ContentItem[] = [
      { type: "image", data: base64Image, mimeType: "image/png" },
      {
        type: "text",
        text: `${savePath ? `Screenshot saved to: ${savePath}\n` : ""}${resolutionInfo}`,
      },
    ];

    return { content };
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
