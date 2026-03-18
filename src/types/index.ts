export interface AdbExecOptions {
  command: string;
  deviceId?: string;
  timeout?: number;
  signal?: AbortSignal;
}

export interface AdbExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  fullCommand: string;
  durationMs: number;
}

export interface AdbStreamOptions {
  command: string;
  deviceId?: string;
  durationMs?: number;
  filter?: string;
  maxLines?: number;
}

export interface AdbStreamResult {
  output: string;
  linesCollected: number;
  durationMs: number;
  truncated: boolean;
  fullCommand: string;
}

export interface DeviceInfo {
  serial: string;
  state: string;
  model?: string;
  androidVersion?: string;
  apiLevel?: string;
  transport: "usb" | "tcp" | "unknown";
}

export interface InstallError {
  code: string;
  suggestion: string;
}

export const INSTALL_ERROR_MAP: Record<string, string> = {
  INSTALL_FAILED_UPDATE_INCOMPATIBLE:
    "Uninstall the existing app first: `adb uninstall <package>`",
  INSTALL_FAILED_INSUFFICIENT_STORAGE: "Free up device storage",
  INSTALL_FAILED_OLDER_SDK:
    "APK minSdk is higher than device API level",
  INSTALL_FAILED_VERSION_DOWNGRADE:
    "Use `-d` flag to allow downgrade",
  INSTALL_FAILED_ALREADY_EXISTS:
    "App already installed. Use `-r` flag to replace",
  INSTALL_FAILED_DEXOPT:
    "DEX optimization failed. Try clearing device storage or rebooting",
  INSTALL_FAILED_NO_MATCHING_ABIS:
    "APK doesn't support device CPU architecture",
};
