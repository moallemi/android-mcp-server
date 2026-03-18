import { unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { executeAdb } from "../core/adb-executor.js";

const JPEG_QUALITY = 80;

type ContentItem =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: "image/jpeg" | "image/png" };

export async function handleAdbScreenshot(args: {
  deviceId?: string;
  savePath?: string;
  fullResolution?: boolean;
}): Promise<{ content: ContentItem[]; isError?: boolean }> {
  const { deviceId, savePath, fullResolution = false } = args;
  const remotePath = "/sdcard/adb_mcp_screenshot.png";
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

    // Pull to local (always to temp first, copy to savePath if requested)
    const pull = await executeAdb({
      command: `pull ${remotePath} ${tempPath}`,
      deviceId,
      timeout: 15000,
    });

    if (pull.exitCode !== 0) {
      return {
        content: [{ type: "text", text: `Failed to pull screenshot: ${pull.stderr.trim()}` }],
        isError: true,
      };
    }

    // If savePath requested, save the full-resolution original there
    if (savePath) {
      await sharp(tempPath).toFile(savePath);
    }

    const metadata = await sharp(tempPath).metadata();
    const originalWidth = metadata.width || 0;
    const originalHeight = metadata.height || 0;

    let imageBuffer: Buffer;
    let mimeType: "image/jpeg" | "image/png";
    let imageWidth: number;
    let imageHeight: number;

    if (fullResolution) {
      // Return full-resolution PNG
      imageBuffer = await sharp(tempPath).png().toBuffer();
      mimeType = "image/png";
      imageWidth = originalWidth;
      imageHeight = originalHeight;
    } else {
      // Compress to JPEG at original resolution
      imageBuffer = await sharp(tempPath)
        .jpeg({ quality: JPEG_QUALITY })
        .toBuffer();
      mimeType = "image/jpeg";
      imageWidth = originalWidth;
      imageHeight = originalHeight;
    }

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

    // Clean up temp file
    if (existsSync(tempPath)) {
      unlinkSync(tempPath);
    }

    let resolutionInfo = "";
    if (sizeResult && sizeResult.exitCode === 0) {
      const match = sizeResult.stdout.match(/(\d+)x(\d+)/);
      if (match) {
        resolutionInfo = `Device screen resolution: ${match[1]}x${match[2]} pixels\nUse these pixel dimensions for any \`input tap\` or \`adb_tap\` coordinates.`;
      }
    }

    const sizeInfo = fullResolution
      ? `Image: ${imageWidth}x${imageHeight} PNG (${Math.round(imageBuffer.length / 1024)}KB)`
      : `Image: ${imageWidth}x${imageHeight} JPEG (${Math.round(imageBuffer.length / 1024)}KB)`;

    const content: ContentItem[] = [
      { type: "image", data: base64Image, mimeType },
      {
        type: "text",
        text: [
          savePath ? `Screenshot saved to: ${savePath}` : null,
          sizeInfo,
          resolutionInfo,
        ].filter(Boolean).join("\n"),
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
