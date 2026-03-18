import { DeviceInfo } from "../types/index.js";
import { executeAdb } from "./adb-executor.js";
import { parseDeviceList } from "../utils/output-parser.js";
import { logger } from "../utils/logger.js";

export async function getConnectedDevices(): Promise<DeviceInfo[]> {
  const result = await executeAdb({ command: "devices -l", timeout: 10000 });
  const devices = parseDeviceList(result.stdout);

  // Enrich online devices with prop info
  const enriched = await Promise.all(
    devices.map(async (device) => {
      if (device.state !== "device") return device;

      try {
        const [versionResult, apiResult, modelResult] = await Promise.all([
          executeAdb({
            command: "shell getprop ro.build.version.release",
            deviceId: device.serial,
            timeout: 5000,
          }),
          executeAdb({
            command: "shell getprop ro.build.version.sdk",
            deviceId: device.serial,
            timeout: 5000,
          }),
          executeAdb({
            command: "shell getprop ro.product.model",
            deviceId: device.serial,
            timeout: 5000,
          }),
        ]);

        device.androidVersion = versionResult.stdout.trim() || undefined;
        device.apiLevel = apiResult.stdout.trim() || undefined;
        if (!device.model) {
          device.model = modelResult.stdout.trim() || undefined;
        }
      } catch (err) {
        logger.warn(`Failed to get props for ${device.serial}: ${err}`);
      }

      return device;
    })
  );

  return enriched;
}
