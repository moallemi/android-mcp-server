import { executeAdb } from "../core/adb-executor.js";

interface UiElement {
  text: string;
  resourceId: string;
  contentDesc: string;
  className: string;
  bounds: { left: number; top: number; right: number; bottom: number };
  centerX: number;
  centerY: number;
  clickable: boolean;
  enabled: boolean;
}

function parseUiHierarchy(xml: string): UiElement[] {
  const elements: UiElement[] = [];
  // Match each <node ... /> or <node ...>
  const nodeRegex = /<node\s[^>]*>/g;
  let match: RegExpExecArray | null;

  while ((match = nodeRegex.exec(xml)) !== null) {
    const node = match[0];

    const text = extractAttr(node, "text");
    const resourceId = extractAttr(node, "resource-id");
    const contentDesc = extractAttr(node, "content-desc");
    const className = extractAttr(node, "class");
    const clickable = extractAttr(node, "clickable") === "true";
    const enabled = extractAttr(node, "enabled") === "true";
    const boundsStr = extractAttr(node, "bounds");

    const boundsMatch = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (!boundsMatch) continue;

    const bounds = {
      left: parseInt(boundsMatch[1], 10),
      top: parseInt(boundsMatch[2], 10),
      right: parseInt(boundsMatch[3], 10),
      bottom: parseInt(boundsMatch[4], 10),
    };

    elements.push({
      text,
      resourceId,
      contentDesc,
      className,
      bounds,
      centerX: Math.round((bounds.left + bounds.right) / 2),
      centerY: Math.round((bounds.top + bounds.bottom) / 2),
      clickable,
      enabled,
    });
  }

  return elements;
}

function extractAttr(node: string, attr: string): string {
  const regex = new RegExp(`${attr}="([^"]*)"`, "i");
  const match = node.match(regex);
  return match ? match[1] : "";
}

function findElements(
  elements: UiElement[],
  args: { text?: string; resourceId?: string; contentDesc?: string; className?: string }
): UiElement[] {
  return elements.filter((el) => {
    if (args.text !== undefined && !el.text.includes(args.text)) return false;
    if (args.resourceId !== undefined && !el.resourceId.includes(args.resourceId)) return false;
    if (args.contentDesc !== undefined && !el.contentDesc.includes(args.contentDesc)) return false;
    if (args.className !== undefined && !el.className.includes(args.className)) return false;
    return true;
  });
}

async function dumpUiHierarchy(deviceId?: string): Promise<string> {
  const remotePath = "/sdcard/adb_mcp_ui_dump.xml";

  const dump = await executeAdb({
    command: `shell uiautomator dump ${remotePath}`,
    deviceId,
    timeout: 30000,
  });

  if (dump.exitCode !== 0 && !dump.stdout.includes("dumped to")) {
    throw new Error(`UI dump failed: ${dump.stderr.trim() || dump.stdout.trim()}`);
  }

  const cat = await executeAdb({
    command: `shell cat ${remotePath}`,
    deviceId,
    timeout: 10000,
  });

  // Clean up
  await executeAdb({
    command: `shell rm ${remotePath}`,
    deviceId,
    timeout: 5000,
  }).catch(() => {});

  return cat.stdout;
}

export async function handleAdbFindAndTap(args: {
  text?: string;
  resourceId?: string;
  contentDesc?: string;
  className?: string;
  deviceId?: string;
}): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const { text, resourceId, contentDesc, className, deviceId } = args;

  if (!text && !resourceId && !contentDesc && !className) {
    return {
      content: [{ type: "text", text: "Error: Provide at least one of: text, resourceId, contentDesc, className" }],
      isError: true,
    };
  }

  try {
    const xml = await dumpUiHierarchy(deviceId);
    const allElements = parseUiHierarchy(xml);
    const matches = findElements(allElements, { text, resourceId, contentDesc, className });

    if (matches.length === 0) {
      const searchCriteria = [
        text && `text="${text}"`,
        resourceId && `resourceId="${resourceId}"`,
        contentDesc && `contentDesc="${contentDesc}"`,
        className && `className="${className}"`,
      ].filter(Boolean).join(", ");

      return {
        content: [{ type: "text", text: `No element found matching ${searchCriteria}.\n\nVisible clickable elements:\n${allElements.filter(e => e.clickable && (e.text || e.contentDesc)).slice(0, 20).map(e => `  - "${e.text || e.contentDesc}" (${e.className.split(".").pop()})`).join("\n") || "  (none found)"}` }],
        isError: true,
      };
    }

    // Tap the first match
    const target = matches[0];
    const tapResult = await executeAdb({
      command: `shell input tap ${target.centerX} ${target.centerY}`,
      deviceId,
      timeout: 10000,
    });

    if (tapResult.exitCode !== 0) {
      return {
        content: [{ type: "text", text: `Found element but tap failed: ${tapResult.stderr.trim()}` }],
        isError: true,
      };
    }

    const info = [
      target.text && `text="${target.text}"`,
      target.contentDesc && `contentDesc="${target.contentDesc}"`,
      target.resourceId && `id="${target.resourceId}"`,
    ].filter(Boolean).join(", ");

    return {
      content: [
        {
          type: "text",
          text: `Tapped on element: ${info}\nCoordinates: (${target.centerX}, ${target.centerY})\nClass: ${target.className}${matches.length > 1 ? `\n\n(${matches.length - 1} more matching element(s) found)` : ""}`,
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

export async function handleAdbGetUiElements(args: {
  text?: string;
  resourceId?: string;
  contentDesc?: string;
  className?: string;
  clickableOnly?: boolean;
  deviceId?: string;
}): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const { text, resourceId, contentDesc, className, clickableOnly = false, deviceId } = args;

  try {
    const xml = await dumpUiHierarchy(deviceId);
    let elements = parseUiHierarchy(xml);

    // Apply filters
    if (text || resourceId || contentDesc || className) {
      elements = findElements(elements, { text, resourceId, contentDesc, className });
    }

    if (clickableOnly) {
      elements = elements.filter((e) => e.clickable);
    }

    // Filter out empty elements for readability
    const meaningful = elements.filter((e) => e.text || e.contentDesc || e.resourceId);

    if (meaningful.length === 0) {
      return {
        content: [{ type: "text", text: "No matching UI elements found on screen." }],
      };
    }

    const lines = meaningful.slice(0, 50).map((el) => {
      const parts = [
        el.text && `text="${el.text}"`,
        el.contentDesc && `desc="${el.contentDesc}"`,
        el.resourceId && `id="${el.resourceId}"`,
        `class=${el.className.split(".").pop()}`,
        `center=(${el.centerX},${el.centerY})`,
        el.clickable ? "clickable" : null,
        !el.enabled ? "disabled" : null,
      ].filter(Boolean);
      return `  ${parts.join(", ")}`;
    });

    return {
      content: [
        {
          type: "text",
          text: `Found ${meaningful.length} element(s)${meaningful.length > 50 ? " (showing first 50)" : ""}:\n\n${lines.join("\n")}`,
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
