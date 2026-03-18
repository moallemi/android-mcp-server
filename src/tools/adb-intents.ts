import { executeAdb } from "../core/adb-executor.js";

export async function handleAdbAppIntents(args: {
  packageName: string;
  deviceId?: string;
}): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const { packageName, deviceId } = args;

  try {
    const result = await executeAdb({
      command: `shell dumpsys package ${packageName}`,
      deviceId,
      timeout: 15000,
    });

    if (!result.stdout.includes(`Package [${packageName}]`)) {
      return {
        content: [
          {
            type: "text",
            text: `Package "${packageName}" not found on device. Use \`adb shell pm list packages\` to list installed packages.`,
          },
        ],
        isError: true,
      };
    }

    const output = result.stdout;

    // Parse Activity Resolver Table
    const activities = parseResolverSection(output, "Activity Resolver Table:");
    const services = parseResolverSection(output, "Service Resolver Table:");
    const receivers = parseResolverSection(output, "Receiver Resolver Table:");

    const sections: string[] = [];

    if (activities.length > 0) {
      sections.push(`Activities (${activities.length}):\n${activities.map((a) => `  ${a}`).join("\n")}`);
    }
    if (services.length > 0) {
      sections.push(`Services (${services.length}):\n${services.map((s) => `  ${s}`).join("\n")}`);
    }
    if (receivers.length > 0) {
      sections.push(`Receivers (${receivers.length}):\n${receivers.map((r) => `  ${r}`).join("\n")}`);
    }

    if (sections.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No intents found for "${packageName}".`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Intents for ${packageName}:\n\n${sections.join("\n\n")}`,
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

function parseResolverSection(dump: string, header: string): string[] {
  const start = dump.indexOf(header);
  if (start === -1) return [];

  const section = dump.substring(start);

  // Find the Non-Data Actions subsection
  const nonDataStart = section.indexOf("\n  Non-Data Actions:");
  if (nonDataStart === -1) return [];

  // Find the end of this subsection (next blank line or next major section)
  const afterNonData = section.substring(nonDataStart);
  const endMatch = afterNonData.indexOf("\n\n");
  const nonDataSection = endMatch === -1 ? afterNonData : afterNonData.substring(0, endMatch);

  const actions: string[] = [];
  for (const line of nonDataSection.split("\n")) {
    const trimmed = line.trim();
    // Action lines start with known prefixes
    if (
      trimmed.startsWith("android.") ||
      trimmed.startsWith("com.") ||
      trimmed.startsWith("org.") ||
      trimmed.startsWith("io.")
    ) {
      // Strip trailing colon if present
      actions.push(trimmed.replace(/:$/, ""));
    }
  }

  return actions;
}
