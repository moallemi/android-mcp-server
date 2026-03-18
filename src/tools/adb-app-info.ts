import { executeAdb } from "../core/adb-executor.js";

export async function handleAdbAppInfo(args: {
  packageName: string;
  deviceId?: string;
}): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const { packageName, deviceId } = args;

  try {
    const [dumpResult, pidResult] = await Promise.all([
      executeAdb({
        command: `shell dumpsys package ${packageName}`,
        deviceId,
        timeout: 15000,
      }),
      executeAdb({
        command: `shell pidof ${packageName}`,
        deviceId,
        timeout: 5000,
      }),
    ]);

    if (!dumpResult.stdout.includes(`Package [${packageName}]`)) {
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

    const dump = dumpResult.stdout;
    const info: Record<string, string | string[] | boolean | null> = {};

    // Version info
    const versionName = dump.match(/versionName=(\S+)/)?.[1] ?? null;
    const versionCode = dump.match(/versionCode=(\d+)/)?.[1] ?? null;
    info.versionName = versionName;
    info.versionCode = versionCode;

    // Install path
    const codePath = dump.match(/codePath=(\S+)/)?.[1] ?? null;
    info.installPath = codePath;

    // Target SDK
    const targetSdk = dump.match(/targetSdk=(\d+)/)?.[1] ?? null;
    info.targetSdk = targetSdk;

    // Min SDK
    const minSdk = dump.match(/minSdk=(\d+)/)?.[1] ?? null;
    info.minSdk = minSdk;

    // Debuggable
    const flags = dump.match(/pkgFlags=\[\s*([^\]]*)\]/)?.[1] ?? "";
    info.debuggable = flags.includes("DEBUGGABLE");

    // Running?
    const pid = pidResult.stdout.trim();
    info.running = pid.length > 0;
    if (pid) info.pid = pid;

    // Permissions
    const grantedPerms: string[] = [];
    const deniedPerms: string[] = [];
    const permSection = dump.match(/install permissions:([\s\S]*?)(?=\n\s*\S+:|$)/)?.[1] ?? "";
    for (const line of permSection.split("\n")) {
      const match = line.match(/(\S+): granted=(true|false)/);
      if (match) {
        if (match[2] === "true") grantedPerms.push(match[1]);
        else deniedPerms.push(match[1]);
      }
    }
    if (grantedPerms.length) info.grantedPermissions = grantedPerms;
    if (deniedPerms.length) info.deniedPermissions = deniedPerms;

    // Memory info if running
    if (pid) {
      try {
        const memResult = await executeAdb({
          command: `shell dumpsys meminfo ${packageName}`,
          deviceId,
          timeout: 10000,
        });
        const totalLine = memResult.stdout.match(/TOTAL\s+(\d+)/);
        if (totalLine) {
          info.memoryKb = totalLine[1];
        }
      } catch { /* optional */ }
    }

    return {
      content: [
        {
          type: "text",
          text: `App info for ${packageName}:\n\n${JSON.stringify(info, null, 2)}`,
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
