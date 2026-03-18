#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { handleAdbCommand } from "./tools/adb-command.js";
import { handleAdbDevices } from "./tools/adb-devices.js";
import { handleAdbStream } from "./tools/adb-stream.js";
import { handleAdbInstall } from "./tools/adb-install.js";
import { handleAdbScreenshot } from "./tools/adb-screenshot.js";
import { handleAdbFileTransfer } from "./tools/adb-file-transfer.js";
import { handleAdbAppInfo } from "./tools/adb-app-info.js";
import { handleAdbUninstall } from "./tools/adb-uninstall.js";
import { getConnectedDevices } from "./core/device-manager.js";
import { logger } from "./utils/logger.js";

const server = new McpServer({
  name: "adb-mcp-server",
  version: "0.1.0",
});

// --- Tools ---

server.tool(
  "adb_command",
  "Run any ADB command. The `command` parameter is everything after `adb` (e.g., \"shell pm list packages -3\"). Returns the command output, exit code, and the full command string for debugging.",
  {
    command: z.string().describe("The ADB command to run (everything after `adb`)"),
    deviceId: z.string().optional().describe("Target device serial. If omitted with multiple devices, returns an error listing available devices."),
    timeout: z.number().optional().describe("Timeout in milliseconds. Default: 30000. Set to 0 for no timeout."),
  },
  async (args) => handleAdbCommand(args)
);

server.tool(
  "adb_devices",
  "List all connected Android devices/emulators with metadata (model, Android version, API level, transport type).",
  {},
  async () => handleAdbDevices()
);

server.tool(
  "adb_stream",
  "Run a streaming/long-running ADB command (e.g., logcat, top). Captures output for a specified duration or number of lines, then returns the collected output.",
  {
    command: z.string().describe("The ADB command to stream (e.g., \"logcat -v time\")"),
    deviceId: z.string().optional().describe("Target device serial"),
    durationMs: z.number().optional().describe("How long to capture output in ms. Default: 10000, Max: 60000."),
    filter: z.string().optional().describe("Substring filter applied to each output line"),
    maxLines: z.number().optional().describe("Stop after collecting this many lines. Default: 500, Max: 5000."),
  },
  async (args) => handleAdbStream(args)
);

server.tool(
  "adb_install",
  "Install an APK on a connected device. Validates the file exists, provides helpful error messages for common install failures (version downgrade, incompatible update, etc.).",
  {
    apkPath: z.string().describe("Path to the APK file"),
    deviceId: z.string().optional().describe("Target device serial"),
    options: z.array(z.string()).optional().describe("Additional install flags. Defaults to [\"-r\", \"-t\"] (replace + allow test APKs)."),
  },
  async (args) => handleAdbInstall(args)
);

server.tool(
  "adb_screenshot",
  "Capture a screenshot from the device screen and save it locally.",
  {
    deviceId: z.string().optional().describe("Target device serial"),
    savePath: z.string().optional().describe("Local path to save the screenshot. Default: ./screenshot_<timestamp>.png"),
  },
  async (args) => handleAdbScreenshot(args)
);

server.tool(
  "adb_file_transfer",
  "Push a local file to the device or pull a file from the device to local filesystem.",
  {
    direction: z.enum(["push", "pull"]).describe("Transfer direction"),
    localPath: z.string().describe("Local file path"),
    remotePath: z.string().describe("Device file path"),
    deviceId: z.string().optional().describe("Target device serial"),
  },
  async (args) => handleAdbFileTransfer(args)
);

server.tool(
  "adb_app_info",
  "Get detailed info about an installed app: version, install path, permissions, whether it's running, memory usage, and more.",
  {
    packageName: z.string().describe("App package name (e.g., com.example.app)"),
    deviceId: z.string().optional().describe("Target device serial"),
  },
  async (args) => handleAdbAppInfo(args)
);

server.tool(
  "adb_uninstall",
  "Uninstall an app from a connected device. Provides helpful error messages for common failures (device admin, system app, unknown package).",
  {
    packageName: z.string().describe("App package name to uninstall (e.g., com.example.app)"),
    deviceId: z.string().optional().describe("Target device serial"),
    keepData: z.boolean().optional().describe("Keep app data and cache after uninstall. Default: false."),
  },
  async (args) => handleAdbUninstall(args)
);

// --- Resources ---

server.resource(
  "connected-devices",
  "devices://connected",
  { mimeType: "application/json", description: "List of currently connected Android devices" },
  async () => {
    const devices = await getConnectedDevices();
    return {
      contents: [
        {
          uri: "devices://connected",
          mimeType: "application/json",
          text: JSON.stringify(devices, null, 2),
        },
      ],
    };
  }
);

// --- Start ---

async function main() {
  logger.info("Starting ADB MCP Server v0.1.0");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("ADB MCP Server connected and ready");
}

main().catch((err) => {
  logger.error("Fatal error:", err);
  process.exit(1);
});
