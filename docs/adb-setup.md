# Setting up ADB

ADB should be in your PATH. Verify with `adb version`. if not, install it.

## macOS

```bash
# Via Homebrew (recommended)
brew install android-platform-tools

# Or install Android Studio which includes platform-tools
# https://developer.android.com/studio
```

## Linux

```bash
# Debian/Ubuntu
sudo apt install adb

# Arch
sudo pacman -S android-tools

# Fedora
sudo dnf install android-tools
```

## Windows

Download [Android SDK Platform Tools](https://developer.android.com/studio/releases/platform-tools) from Google, extract the zip, and add the folder to your PATH.

Or via winget:
```powershell
winget install Google.PlatformTools
```

## Verify installation

```bash
adb version
adb devices
```

## Enable USB debugging

Enable **USB debugging** on your device: *Settings → Developer options → USB debugging*.

If Developer options is hidden, tap *Build number* 7 times in *Settings → About phone*.
