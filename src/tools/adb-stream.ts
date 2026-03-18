import { streamAdb } from "../core/stream-manager.js";

export async function handleAdbStream(args: {
  command: string;
  deviceId?: string;
  durationMs?: number;
  filter?: string;
  maxLines?: number;
}): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  try {
    const result = await streamAdb({
      command: args.command,
      deviceId: args.deviceId,
      durationMs: args.durationMs,
      filter: args.filter,
      maxLines: args.maxLines,
    });

    const meta = [
      `Lines collected: ${result.linesCollected}`,
      `Duration: ${result.durationMs}ms`,
      result.truncated ? "Output was truncated (maxLines reached)" : null,
    ]
      .filter(Boolean)
      .join(", ");

    return {
      content: [
        {
          type: "text",
          text: `$ ${result.fullCommand}\n\n${result.output || "(no output)"}\n\n[${meta}]`,
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
