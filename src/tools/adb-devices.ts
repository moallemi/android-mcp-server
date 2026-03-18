import { getConnectedDevices } from "../core/device-manager.js";

export async function handleAdbDevices(): Promise<{
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}> {
  try {
    const devices = await getConnectedDevices();

    if (devices.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No devices connected.\n\nTo connect a device:\n- USB: Enable USB debugging on your Android device and connect via USB\n- Emulator: Start an emulator with `emulator -avd <name>`\n- WiFi: Use `adb connect <ip>:<port>`",
          },
        ],
      };
    }

    const formatted = devices.map((d) => {
      const parts = [`  Serial: ${d.serial}`, `  State: ${d.state}`, `  Transport: ${d.transport}`];
      if (d.model) parts.push(`  Model: ${d.model}`);
      if (d.androidVersion) parts.push(`  Android: ${d.androidVersion}`);
      if (d.apiLevel) parts.push(`  API Level: ${d.apiLevel}`);
      return parts.join("\n");
    });

    return {
      content: [
        {
          type: "text",
          text: `Found ${devices.length} device(s):\n\n${formatted.join("\n\n")}`,
        },
      ],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `Error listing devices: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    };
  }
}
