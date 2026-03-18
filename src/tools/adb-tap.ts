import { executeAdb } from "../core/adb-executor.js";

async function getDeviceResolution(deviceId?: string): Promise<{ width: number; height: number } | null> {
  try {
    const result = await executeAdb({
      command: "shell wm size",
      deviceId,
      timeout: 5000,
    });
    const match = result.stdout.match(/(\d+)x(\d+)/);
    if (match) {
      return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
    }
  } catch { /* fall through */ }
  return null;
}

export async function handleAdbTap(args: {
  x: number;
  y: number;
  deviceId?: string;
  screenshotWidth?: number;
  screenshotHeight?: number;
}): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const { deviceId, screenshotWidth, screenshotHeight } = args;
  let { x, y } = args;

  try {
    // If screenshot dimensions are provided, scale to actual device resolution
    if (screenshotWidth && screenshotHeight) {
      const resolution = await getDeviceResolution(deviceId);
      if (resolution) {
        const scaleX = resolution.width / screenshotWidth;
        const scaleY = resolution.height / screenshotHeight;
        const originalX = x;
        const originalY = y;
        x = Math.round(x * scaleX);
        y = Math.round(y * scaleY);

        const result = await executeAdb({
          command: `shell input tap ${x} ${y}`,
          deviceId,
          timeout: 10000,
        });

        if (result.exitCode !== 0) {
          return {
            content: [{ type: "text", text: `Tap failed: ${result.stderr.trim()}` }],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `Tapped at (${x}, ${y}) on device\nScaled from (${originalX}, ${originalY}) in ${screenshotWidth}x${screenshotHeight} image → ${resolution.width}x${resolution.height} device (${scaleX.toFixed(2)}x, ${scaleY.toFixed(2)}x)`,
            },
          ],
        };
      }
    }

    // No scaling needed — use coordinates directly
    const result = await executeAdb({
      command: `shell input tap ${x} ${y}`,
      deviceId,
      timeout: 10000,
    });

    if (result.exitCode !== 0) {
      return {
        content: [{ type: "text", text: `Tap failed: ${result.stderr.trim()}` }],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Tapped at (${x}, ${y}) on device`,
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
