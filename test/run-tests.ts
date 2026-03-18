#!/usr/bin/env npx tsx

/**
 * Automated test runner for ADB MCP Server.
 * Tests all tools against the spec checklist.
 *
 * Usage: npx tsx test/run-tests.ts
 *
 * Requires at least one connected Android device or emulator.
 */

import { spawn, ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";

const SERVER_PATH = resolve(import.meta.dirname, "../dist/index.js");

let server: ChildProcess;
let requestId = 0;
let responseBuffer = "";
const pendingRequests = new Map<number, {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}>();

// --- Test infrastructure ---

function startServer(): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    server = spawn("node", [SERVER_PATH], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    server.stderr?.on("data", (chunk: Buffer) => {
      // Debug: uncomment to see server logs
      // process.stderr.write(`[SERVER] ${chunk}`);
    });

    server.stdout?.on("data", (chunk: Buffer) => {
      responseBuffer += chunk.toString("utf-8");
      const lines = responseBuffer.split("\n");
      responseBuffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id !== undefined && pendingRequests.has(msg.id)) {
            const pending = pendingRequests.get(msg.id)!;
            pendingRequests.delete(msg.id);
            pending.resolve(msg);
          }
        } catch {
          // Not JSON, ignore
        }
      }
    });

    server.on("error", reject);

    // Initialize the MCP connection
    sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-runner", version: "1.0" },
    }).then(() => {
      // Send initialized notification
      const notification = JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      });
      server.stdin?.write(notification + "\n");
      resolvePromise();
    }).catch(reject);
  });
}

function sendRequest(method: string, params: unknown): Promise<any> {
  const id = ++requestId;
  const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`Request ${method} (id=${id}) timed out after 60s`));
    }, 60000);

    pendingRequests.set(id, {
      resolve: (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      reject: (reason) => {
        clearTimeout(timeout);
        reject(reason);
      },
    });

    server.stdin?.write(msg + "\n");
  });
}

async function callTool(name: string, args: Record<string, unknown> = {}): Promise<any> {
  const response = await sendRequest("tools/call", { name, arguments: args });
  return response.result ?? response.error;
}

function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!server || server.killed) {
      resolve();
      return;
    }
    server.on("close", () => resolve());
    server.kill("SIGTERM");
    setTimeout(() => {
      if (!server.killed) server.kill("SIGKILL");
    }, 3000);
  });
}

// --- Test helpers ---

type TestResult = { name: string; passed: boolean; detail: string };
const results: TestResult[] = [];

function getTextContent(result: any): string {
  if (result?.content?.[0]?.text) return result.content[0].text;
  if (result?.message) return result.message;
  return JSON.stringify(result);
}

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, passed: true, detail: "OK" });
    console.log(`  ✅ ${name}`);
  } catch (err: any) {
    results.push({ name, passed: false, detail: err.message });
    console.log(`  ❌ ${name}: ${err.message}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

// --- Tests ---

async function runTests() {
  console.log("\n🔧 Starting ADB MCP Server...\n");
  await startServer();
  console.log("✔ Server started\n");

  // First, check if we have devices
  console.log("── adb_devices ──");

  let devices: string[] = [];

  await test("adb_devices returns device list", async () => {
    const result = await callTool("adb_devices");
    const text = getTextContent(result);
    assert(!result.isError, `Error: ${text}`);
    // Extract serials for later use
    const serialMatches = text.matchAll(/Serial:\s+(\S+)/g);
    devices = [...serialMatches].map((m) => m[1]);
    assert(devices.length > 0, "No devices found — connect a device or start an emulator to run full tests");
  });

  await test("adb_devices includes model/version metadata", async () => {
    const result = await callTool("adb_devices");
    const text = getTextContent(result);
    assert(text.includes("Android:") || text.includes("API Level:"), "Missing version metadata");
  });

  if (devices.length === 0) {
    console.log("\n⚠️  No devices connected. Skipping device-dependent tests.\n");
    printSummary();
    await stopServer();
    return;
  }

  const deviceId = devices[0];
  console.log(`\nUsing device: ${deviceId}\n`);

  // --- adb_command ---
  console.log("── adb_command ──");

  await test("simple command: shell echo hello", async () => {
    const result = await callTool("adb_command", {
      command: "shell echo hello",
      deviceId,
    });
    const text = getTextContent(result);
    assert(text.includes("hello"), `Expected 'hello' in output, got: ${text}`);
    assert(text.includes("exit code: 0"), "Expected exit code 0");
  });

  await test("command with spaces and special chars", async () => {
    const result = await callTool("adb_command", {
      command: 'shell echo "hello world"',
      deviceId,
    });
    const text = getTextContent(result);
    assert(text.includes("hello world"), `Expected 'hello world', got: ${text}`);
  });

  await test("command respects timeout", async () => {
    const start = Date.now();
    const result = await callTool("adb_command", {
      command: "shell sleep 30",
      deviceId,
      timeout: 2000,
    });
    const elapsed = Date.now() - start;
    assert(elapsed < 10000, `Should have timed out quickly, took ${elapsed}ms`);
    const text = getTextContent(result);
    assert(
      text.includes("timed out") || result.isError === true,
      "Expected timeout indication"
    );
  });

  await test("errors gracefully with invalid device serial", async () => {
    const result = await callTool("adb_command", {
      command: "shell echo hello",
      deviceId: "nonexistent-device-12345",
    });
    assert(result.isError === true, "Expected error for invalid device");
  });

  await test("output includes full debug command", async () => {
    const result = await callTool("adb_command", {
      command: "shell echo debug_test",
      deviceId,
    });
    const text = getTextContent(result);
    assert(text.includes("adb") && text.includes("shell echo debug_test"), "Missing debug command in output");
  });

  // --- adb_stream ---
  console.log("\n── adb_stream ──");

  await test("captures logcat and stops after durationMs", async () => {
    const start = Date.now();
    const result = await callTool("adb_stream", {
      command: "logcat -v time",
      deviceId,
      durationMs: 3000,
    });
    const elapsed = Date.now() - start;
    const text = getTextContent(result);
    assert(elapsed < 10000, `Took too long: ${elapsed}ms`);
    assert(text.includes("Lines collected:"), "Missing metadata");
  });

  await test("respects maxLines", async () => {
    const result = await callTool("adb_stream", {
      command: "logcat -v time",
      deviceId,
      durationMs: 15000,
      maxLines: 5,
    });
    const text = getTextContent(result);
    assert(text.includes("Lines collected: 5"), `Expected 5 lines, got: ${text}`);
    assert(text.includes("truncated"), "Expected truncation notice");
  });

  await test("filter works", async () => {
    // Generate a known log line then capture it
    await callTool("adb_command", {
      command: 'shell log -t ADB_MCP_TEST "filter_test_marker"',
      deviceId,
    });
    const result = await callTool("adb_stream", {
      command: "logcat -v tag -d",
      deviceId,
      filter: "ADB_MCP_TEST",
      durationMs: 5000,
    });
    const text = getTextContent(result);
    // Every non-empty line should contain our filter
    const lines = text.split("\n").filter((l: string) =>
      l.trim() && !l.startsWith("$") && !l.startsWith("[")
    );
    const matching = lines.filter((l: string) => l.includes("ADB_MCP_TEST"));
    assert(matching.length > 0, "Filter didn't find our test marker");
  });

  await test("no zombie processes after streaming", async () => {
    await callTool("adb_stream", {
      command: "logcat -v time",
      deviceId,
      durationMs: 2000,
      maxLines: 10,
    });
    // Small delay for process cleanup
    await new Promise((r) => setTimeout(r, 1500));
    const result = await callTool("adb_command", {
      command: "shell echo alive",
      deviceId,
    });
    const text = getTextContent(result);
    assert(text.includes("alive"), "Server unresponsive after stream — possible zombie issue");
  });

  // --- adb_screenshot ---
  console.log("\n── adb_screenshot ──");

  const screenshotPath = resolve(import.meta.dirname, "../test-screenshot.png");

  await test("captures and returns inline base64 image", async () => {
    const result = await callTool("adb_screenshot", { deviceId });
    assert(!result.isError, `Error: ${getTextContent(result)}`);
    const imageContent = result.content?.find((c: any) => c.type === "image");
    assert(imageContent, "Missing image content block in response");
    assert(imageContent.mimeType === "image/jpeg", `Expected image/jpeg, got ${imageContent.mimeType}`);
    assert(imageContent.data.length > 100, "Base64 data too short — likely not a real image");
    const textContent = result.content?.find((c: any) => c.type === "text");
    assert(textContent?.text?.includes("Device screen resolution:"), "Missing resolution info");
  });

  await test("saves to file when savePath provided", async () => {
    if (existsSync(screenshotPath)) unlinkSync(screenshotPath);

    const result = await callTool("adb_screenshot", {
      deviceId,
      savePath: screenshotPath,
    });
    assert(!result.isError, `Error: ${getTextContent(result)}`);
    assert(existsSync(screenshotPath), "Screenshot file not created");

    // Clean up
    unlinkSync(screenshotPath);
  });

  // --- adb_find_and_tap / adb_get_ui_elements ---
  console.log("\n── adb_ui ──");

  await test("get_ui_elements lists visible elements", async () => {
    // Open Settings to ensure there are UI elements on screen
    await callTool("adb_command", {
      command: "shell am start -a android.settings.SETTINGS",
      deviceId,
    });
    await new Promise((r) => setTimeout(r, 3000));

    const result = await callTool("adb_get_ui_elements", { deviceId });
    const text = getTextContent(result);
    assert(!result.isError, `Error: ${text}`);
    assert(text.includes("Found"), `Expected element list, got: ${text}`);
  });

  await test("find_and_tap errors when no search criteria given", async () => {
    const result = await callTool("adb_find_and_tap", { deviceId });
    assert(result.isError === true, "Expected error with no criteria");
  });

  await test("find_and_tap errors for nonexistent element", async () => {
    const result = await callTool("adb_find_and_tap", {
      text: "zzz_nonexistent_element_xyz_12345",
      deviceId,
    });
    assert(result.isError === true, "Expected error for missing element");
    assert(getTextContent(result).includes("No element found"), "Expected not-found message");
  });

  // --- adb_tap ---
  console.log("\n── adb_tap ──");

  await test("tap with direct device coordinates", async () => {
    const result = await callTool("adb_tap", {
      x: 540,
      y: 1212,
      deviceId,
    });
    const text = getTextContent(result);
    assert(!result.isError, `Error: ${text}`);
    assert(text.includes("Tapped at (540, 1212)"), `Unexpected output: ${text}`);
  });

  await test("tap with auto-scaling from screenshot dimensions", async () => {
    const result = await callTool("adb_tap", {
      x: 100,
      y: 200,
      deviceId,
      screenshotWidth: 540,
      screenshotHeight: 1212,
    });
    const text = getTextContent(result);
    assert(!result.isError, `Error: ${text}`);
    assert(text.includes("Scaled from"), `Expected scaling info, got: ${text}`);
  });

  // --- adb_file_transfer ---
  console.log("\n── adb_file_transfer ──");

  const testFilePath = resolve(import.meta.dirname, "../test-transfer.txt");
  const pulledFilePath = resolve(import.meta.dirname, "../test-pulled.txt");

  await test("push file to device", async () => {
    writeFileSync(testFilePath, "adb-mcp-server transfer test\n");
    const result = await callTool("adb_file_transfer", {
      direction: "push",
      localPath: testFilePath,
      remotePath: "/sdcard/adb_mcp_test_file.txt",
      deviceId,
    });
    const text = getTextContent(result);
    assert(!result.isError, `Push failed: ${text}`);

    // Verify it arrived
    const verify = await callTool("adb_command", {
      command: "shell cat /sdcard/adb_mcp_test_file.txt",
      deviceId,
    });
    assert(getTextContent(verify).includes("transfer test"), "File content mismatch on device");
  });

  await test("pull file from device", async () => {
    if (existsSync(pulledFilePath)) unlinkSync(pulledFilePath);
    const result = await callTool("adb_file_transfer", {
      direction: "pull",
      localPath: pulledFilePath,
      remotePath: "/sdcard/adb_mcp_test_file.txt",
      deviceId,
    });
    const text = getTextContent(result);
    assert(!result.isError, `Pull failed: ${text}`);
    assert(existsSync(pulledFilePath), "Pulled file not created");

    // Clean up
    unlinkSync(pulledFilePath);
    unlinkSync(testFilePath);
    await callTool("adb_command", {
      command: "shell rm /sdcard/adb_mcp_test_file.txt",
      deviceId,
    });
  });

  // --- adb_install ---
  console.log("\n── adb_install ──");

  await test("installs a valid APK successfully", async () => {
    const apkLocalPath = resolve(import.meta.dirname, "../test-install.apk");
    if (existsSync(apkLocalPath)) unlinkSync(apkLocalPath);

    // Find the APK path for a small system app (SettingsProvider is always present and small)
    const pathResult = await callTool("adb_command", {
      command: "shell pm path com.android.providers.settings",
      deviceId,
    });
    const apkMatch = getTextContent(pathResult).match(/package:(\S+)/);
    assert(apkMatch !== null, "Could not find SettingsProvider APK path on device");
    const remoteApk = apkMatch![1];

    // Pull the APK locally
    const pullResult = await callTool("adb_file_transfer", {
      direction: "pull",
      localPath: apkLocalPath,
      remotePath: remoteApk,
      deviceId,
    });
    assert(!pullResult.isError, `Failed to pull APK: ${getTextContent(pullResult)}`);
    assert(existsSync(apkLocalPath), "APK not pulled to local");

    // Install it using adb_install
    const installResult = await callTool("adb_install", {
      apkPath: apkLocalPath,
      deviceId,
      options: ["-r", "-t", "-d"],
    });
    const text = getTextContent(installResult);
    assert(text.includes("successfully"), `Install did not succeed: ${text}`);

    // Clean up
    unlinkSync(apkLocalPath);
  });

  await test("returns helpful error for missing APK", async () => {
    const result = await callTool("adb_install", {
      apkPath: "/nonexistent/fake-app.apk",
      deviceId,
    });
    assert(result.isError === true, "Expected error");
    assert(getTextContent(result).includes("not found"), "Expected file-not-found message");
  });

  // --- adb_uninstall ---
  console.log("\n── adb_uninstall ──");

  await test("returns error for nonexistent package uninstall", async () => {
    const result = await callTool("adb_uninstall", {
      packageName: "com.fake.nonexistent.app.xyz",
      deviceId,
    });
    assert(result.isError === true, "Expected error for nonexistent package");
    assert(getTextContent(result).includes("may not be installed"), "Expected not-installed message");
  });

  // --- adb_app_info ---
  console.log("\n── adb_app_info ──");

  await test("returns aggregated data for installed app", async () => {
    const result = await callTool("adb_app_info", {
      packageName: "com.android.settings",
      deviceId,
    });
    const text = getTextContent(result);
    assert(!result.isError, `Error: ${text}`);
    assert(text.includes("versionName"), "Missing versionName");
    assert(text.includes("installPath") || text.includes("codePath"), "Missing install path");
  });

  await test("returns error for nonexistent package", async () => {
    const result = await callTool("adb_app_info", {
      packageName: "com.fake.nonexistent.app.xyz",
      deviceId,
    });
    assert(result.isError === true, "Expected error for nonexistent package");
  });

  // --- adb_app_intents ---
  console.log("\n── adb_app_intents ──");

  await test("returns intents for installed app", async () => {
    const result = await callTool("adb_app_intents", {
      packageName: "com.android.settings",
      deviceId,
    });
    const text = getTextContent(result);
    assert(!result.isError, `Error: ${text}`);
    assert(text.includes("Activities"), "Expected activities section");
    assert(text.includes("android."), "Expected android intent actions");
  });

  await test("returns error for nonexistent package intents", async () => {
    const result = await callTool("adb_app_intents", {
      packageName: "com.fake.nonexistent.app.xyz",
      deviceId,
    });
    assert(result.isError === true, "Expected error for nonexistent package");
  });

  // --- Resource ---
  console.log("\n── resources ──");

  await test("devices://connected resource returns JSON", async () => {
    const response = await sendRequest("resources/read", {
      uri: "devices://connected",
    });
    const content = response.result?.contents?.[0];
    assert(content, "No resource content returned");
    assert(content.mimeType === "application/json", `Expected JSON mime, got ${content.mimeType}`);
    const data = JSON.parse(content.text);
    assert(Array.isArray(data), "Expected array of devices");
    assert(data.length > 0, "Expected at least one device in resource");
  });

  // --- Summary ---
  printSummary();
  await stopServer();
}

function printSummary() {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  console.log("\n═══════════════════════════════════");
  console.log(`  Results: ${passed}/${total} passed, ${failed} failed`);
  console.log("═══════════════════════════════════\n");

  if (failed > 0) {
    console.log("Failed tests:");
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  ❌ ${r.name}: ${r.detail}`);
    }
    console.log();
    process.exitCode = 1;
  }
}

runTests().catch((err) => {
  console.error("Fatal error:", err);
  stopServer();
  process.exit(1);
});
