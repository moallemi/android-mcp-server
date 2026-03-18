import { INSTALL_ERROR_MAP } from "../types/index.js";

export function mapAdbError(
  stderr: string,
  stdout: string
): { error: string; message: string; suggestion?: string } | null {
  const combined = `${stderr}\n${stdout}`;

  if (combined.includes("no devices/emulators found")) {
    return {
      error: "NO_DEVICES",
      message: "No devices or emulators found",
      suggestion:
        "Connect a device via USB, or start an emulator with `emulator -avd <name>`",
    };
  }

  if (combined.includes("more than one device/emulator")) {
    return {
      error: "MULTIPLE_DEVICES",
      message:
        "Multiple devices connected. Specify a deviceId to target one.",
      suggestion: "Use the adb_devices tool to list available devices",
    };
  }

  if (combined.includes("unauthorized")) {
    return {
      error: "DEVICE_UNAUTHORIZED",
      message: "Device is unauthorized",
      suggestion:
        "Check the device screen for a USB debugging authorization prompt and tap 'Allow'",
    };
  }

  if (combined.includes("device offline")) {
    return {
      error: "DEVICE_OFFLINE",
      message: "Device is offline",
      suggestion:
        "Try: `adb reconnect` or unplug and replug the USB cable",
    };
  }

  return null;
}

export function mapInstallError(output: string): string | null {
  for (const [code, suggestion] of Object.entries(INSTALL_ERROR_MAP)) {
    if (output.includes(code)) {
      return `${code}: ${suggestion}`;
    }
  }
  return null;
}
