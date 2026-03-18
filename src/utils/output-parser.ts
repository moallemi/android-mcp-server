import { DeviceInfo } from "../types/index.js";

/**
 * Parse the output of `adb devices -l` into structured device info.
 */
export function parseDeviceList(output: string): DeviceInfo[] {
  const lines = output.split("\n").filter((l) => l.trim().length > 0);
  const devices: DeviceInfo[] = [];

  for (const line of lines) {
    // Skip the header line
    if (line.startsWith("List of devices")) continue;
    // Skip lines that are just whitespace
    if (!line.trim()) continue;

    // Format: <serial> <state> [key:value ...]
    const match = line.match(/^(\S+)\s+(device|offline|unauthorized|no permissions|authorizing|connecting)(.*)$/);
    if (!match) continue;

    const serial = match[1];
    const state = match[2];
    const rest = match[3] || "";

    // Parse key:value pairs from the rest
    const modelMatch = rest.match(/model:(\S+)/);
    const transport = inferTransport(serial);

    devices.push({
      serial,
      state,
      model: modelMatch?.[1]?.replace(/_/g, " "),
      transport,
    });
  }

  return devices;
}

function inferTransport(serial: string): "usb" | "tcp" | "unknown" {
  // Emulators use emulator-XXXX format
  if (serial.startsWith("emulator-")) return "tcp";
  // TCP connections use IP:port format
  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(serial)) return "tcp";
  // Everything else is likely USB
  return "usb";
}
