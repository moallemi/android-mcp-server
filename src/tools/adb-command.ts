import { executeAdb } from "../core/adb-executor.js";
import { mapAdbError } from "../utils/error-mapper.js";

export async function handleAdbCommand(args: {
  command: string;
  deviceId?: string;
  timeout?: number;
}): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  try {
    const result = await executeAdb({
      command: args.command,
      deviceId: args.deviceId,
      timeout: args.timeout,
    });

    const adbError = mapAdbError(result.stderr, result.stdout);
    if (adbError && result.exitCode !== 0) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ...adbError,
                debugCommand: result.fullCommand,
                exitCode: result.exitCode,
                stderr: result.stderr.trim(),
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }

    const output = [result.stdout, result.stderr]
      .filter((s) => s.trim())
      .join("\n");

    return {
      content: [
        {
          type: "text",
          text: `$ ${result.fullCommand}\n\n${output.trim() || "(no output)"}\n\n[exit code: ${result.exitCode}, duration: ${result.durationMs}ms]`,
        },
      ],
      isError: result.exitCode !== 0,
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
