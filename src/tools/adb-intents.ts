import { executeAdb } from "../core/adb-executor.js";

interface IntentFilter {
  component: string;
  actions: string[];
  categories: string[];
  schemes: string[];
  authorities: string[];
  autoVerify: boolean;
  priority: number | null;
}

interface ResolverTable {
  schemes: Map<string, IntentFilter[]>;
  nonDataActions: Map<string, IntentFilter[]>;
}

export async function handleAdbAppActions(args: {
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

    const activityTable = parseResolverTable(output, "Activity Resolver Table:");
    const serviceTable = parseResolverTable(output, "Service Resolver Table:");
    const receiverTable = parseResolverTable(output, "Receiver Resolver Table:");

    const sections: string[] = [];

    const activityText = formatResolverTable(activityTable);
    if (activityText) sections.push(`=== Activity Resolver Table ===\n${activityText}`);

    const serviceText = formatResolverTable(serviceTable);
    if (serviceText) sections.push(`=== Service Resolver Table ===\n${serviceText}`);

    const receiverText = formatResolverTable(receiverTable);
    if (receiverText) sections.push(`=== Receiver Resolver Table ===\n${receiverText}`);

    if (sections.length === 0) {
      return {
        content: [{ type: "text", text: `No registered actions found for "${packageName}".` }],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Actions for ${packageName}:\n\n${sections.join("\n\n")}`,
        },
      ],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
      isError: true,
    };
  }
}

function parseResolverTable(dump: string, header: string): ResolverTable {
  const table: ResolverTable = {
    schemes: new Map(),
    nonDataActions: new Map(),
  };

  const start = dump.indexOf(header);
  if (start === -1) return table;

  // Extract the full table section (ends at next top-level table or end of relevant content)
  const afterHeader = dump.substring(start + header.length);
  const nextTableMatch = afterHeader.match(/\n[A-Z][a-z]+ Resolver Table:|\nKey Set Manager:|\nPackages:|\nPermission trees:/);
  const tableSection = nextTableMatch
    ? afterHeader.substring(0, nextTableMatch.index!)
    : afterHeader;

  // Parse Schemes subsection
  const schemesStart = tableSection.indexOf("\n  Schemes:");
  if (schemesStart !== -1) {
    const schemesSection = extractSubsection(tableSection, schemesStart);
    parseGroupedEntries(schemesSection, table.schemes);
  }

  // Parse Non-Data Actions subsection
  const nonDataStart = tableSection.indexOf("\n  Non-Data Actions:");
  if (nonDataStart !== -1) {
    const nonDataSection = extractSubsection(tableSection, nonDataStart);
    parseGroupedEntries(nonDataSection, table.nonDataActions);
  }

  return table;
}

function extractSubsection(tableSection: string, startIndex: number): string {
  const afterStart = tableSection.substring(startIndex);
  // A subsection ends when we hit another subsection header (2-space indent + word + colon)
  // or a blank line followed by non-indented content
  const lines = afterStart.split("\n");
  const result: string[] = [lines[0]]; // include header line

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // New subsection header at same indent level
    if (/^  [A-Z][a-zA-Z ]+:/.test(line) && !line.startsWith("      ")) {
      break;
    }
    result.push(line);
  }

  return result.join("\n");
}

function parseGroupedEntries(section: string, target: Map<string, IntentFilter[]>): void {
  const lines = section.split("\n");
  let currentGroup = "";
  let currentFilter: IntentFilter | null = null;

  for (const line of lines) {
    // Group header (4-space indent): "
    const groupMatch = line.match(/^      (\S+):$/);
    if (groupMatch) {
      currentGroup = groupMatch[1];
      if (!target.has(currentGroup)) {
        target.set(currentGroup, []);
      }
      continue;
    }

    // Component line (8-space indent): "
    const componentMatch = line.match(/^\s{8}[0-9a-f]+ (\S+) filter [0-9a-f]+/);
    if (componentMatch) {
      currentFilter = {
        component: componentMatch[1],
        actions: [],
        categories: [],
        schemes: [],
        authorities: [],
        autoVerify: false,
        priority: null,
      };
      if (currentGroup && target.has(currentGroup)) {
        target.get(currentGroup)!.push(currentFilter);
      }
      continue;
    }

    if (!currentFilter) continue;

    const trimmed = line.trim();

    const actionMatch = trimmed.match(/^Action: "(.+)"$/);
    if (actionMatch) {
      currentFilter.actions.push(actionMatch[1]);
      continue;
    }

    const categoryMatch = trimmed.match(/^Category: "(.+)"$/);
    if (categoryMatch) {
      currentFilter.categories.push(categoryMatch[1]);
      continue;
    }

    const schemeMatch = trimmed.match(/^Scheme: "(.+)"$/);
    if (schemeMatch) {
      currentFilter.schemes.push(schemeMatch[1]);
      continue;
    }

    const authorityMatch = trimmed.match(/^Authority: "(.+)":/);
    if (authorityMatch) {
      currentFilter.authorities.push(authorityMatch[1]);
      continue;
    }

    if (trimmed === "AutoVerify=true") {
      currentFilter.autoVerify = true;
      continue;
    }

    const priorityMatch = trimmed.match(/mPriority=(-?\d+)/);
    if (priorityMatch) {
      currentFilter.priority = parseInt(priorityMatch[1], 10);
    }
  }
}

function formatResolverTable(table: ResolverTable): string {
  const parts: string[] = [];

  if (table.schemes.size > 0) {
    parts.push("Schemes:");
    for (const [scheme, filters] of table.schemes) {
      for (const filter of filters) {
        parts.push(formatFilter(scheme, filter));
      }
    }
  }

  if (table.nonDataActions.size > 0) {
    parts.push("Non-Data Actions:");
    for (const [action, filters] of table.nonDataActions) {
      for (const filter of filters) {
        parts.push(formatFilter(action, filter));
      }
    }
  }

  return parts.join("\n");
}

function formatFilter(groupKey: string, filter: IntentFilter): string {
  const lines = [`  ${groupKey} → ${filter.component}`];

  if (filter.actions.length > 0) {
    lines.push(`    Actions: ${filter.actions.join(", ")}`);
  }
  if (filter.categories.length > 0) {
    lines.push(`    Categories: ${filter.categories.join(", ")}`);
  }
  if (filter.schemes.length > 0) {
    lines.push(`    Schemes: ${filter.schemes.join(", ")}`);
  }
  if (filter.authorities.length > 0) {
    lines.push(`    Authorities: ${filter.authorities.join(", ")}`);
  }
  if (filter.autoVerify) {
    lines.push(`    AutoVerify: true`);
  }
  if (filter.priority !== null && filter.priority !== 0) {
    lines.push(`    Priority: ${filter.priority}`);
  }

  return lines.join("\n");
}
