# Android MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that exposes Android Debug Bridge (ADB) to AI assistants. Control Android devices and emulators directly from Claude, Codex, GitHub Copilot, Gemini CLI, Cursor, or any MCP-compatible client.

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Setting up ADB](docs/adb-setup.md)
- [Installation](#installation)
- [Tools](#tools)
- [Example usage](#example-usage)
- [Development](#development)
- [License](#license)

## Features

- **Screenshot** — capture device screen with inline image display and auto-compression
- **UI interaction** — tap, swipe, find elements by text/ID, type text, press keys
- **App management** — install, uninstall, inspect app info and intent filters
- **File transfer** — push and pull files between host and device
- **Streaming** — capture logcat, top, and other long-running commands
- **Multi-device** — target specific devices by serial when multiple are connected
- **Claude Desktop compatible** — auto-detects ADB path, no PATH configuration needed

## Requirements

- [Node.js](https://nodejs.org) 18+
- [Android SDK Platform Tools](https://developer.android.com/studio/releases/platform-tools) (`adb`)
- A connected Android device or running emulator

## Setting up ADB

See [docs/adb-setup.md](docs/adb-setup.md) for installation instructions on macOS, Linux, and Windows.

## Installation

### Claude Desktop

Add to `claude_desktop_config.json`:

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

```json
{
  "mcpServers": {
    "android": {
      "command": "npx",
      "args": ["-y", "@moallemi/android-mcp-server"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add android -- npx -y @moallemi/android-mcp-server
```

Or add manually to `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "android": {
      "command": "npx",
      "args": ["-y", "@moallemi/android-mcp-server"]
    }
  }
}
```

### Other MCP clients

Use `command: npx` with `args: ["-y", "@moallemi/android-mcp-server"]` in your client's MCP server configuration.

### Run manually

```bash
npx @moallemi/android-mcp-server
```

## Tools

### Device

| Tool | Description |
|------|-------------|
| `adb_devices` | List connected devices with model, Android version, and API level |
| `adb_command` | Run any ADB command (everything after `adb`) |
| `adb_stream` | Capture streaming output (logcat, top) for a set duration or line count |

### Screen & Interaction

| Tool | Description |
|------|-------------|
| `adb_screenshot` | Capture screen — returns inline image compressed to JPEG. Use `savePath` to also save locally, `fullResolution: true` for PNG. |
| `adb_tap` | Tap screen coordinates. Pass `screenshotWidth`/`screenshotHeight` to auto-scale from image coordinates to device resolution. |
| `adb_find_and_tap` | Find a UI element by text, resource ID, or content description and tap it |
| `adb_get_ui_elements` | List visible UI elements — filter by text, resource ID, class, or clickable |

### App Management

| Tool | Description |
|------|-------------|
| `adb_install` | Install an APK with helpful error messages for common failures |
| `adb_uninstall` | Uninstall an app by package name |
| `adb_app_info` | Get version, permissions, install path, memory usage, and running status |
| `adb_app_actions` | Discover all registered activities, services, and receivers with their intent filters |

### File Transfer

| Tool | Description |
|------|-------------|
| `adb_file_transfer` | Push a local file to device or pull a file from device |

## Example usage

Once configured, you can ask Claude things like:

- *"Take a screenshot of my device"*
- *"Open the Settings app and navigate to Wi-Fi"*
- *"Tap the Login button"*
- *"Install the APK at ~/Downloads/app-debug.apk"*
- *"What activities does com.example.app have?"*
- *"Show me the last 100 lines of logcat filtered to 'crash'"*
- *"Pull the database file from /data/data/com.example.app/databases/app.db"*

## Development

```bash
# Clone and install
git clone https://github.com/moallemi/android-mcp-server
cd android-mcp-server
npm install

# Build
npm run build

# Run tests (requires a connected device or emulator)
npm test
```

## License

MIT
