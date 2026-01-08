# Netcatty RISC-V Build Guide

This document describes how to build and package Netcatty for the RISC-V (riscv64) architecture. Since Electron does not officially support RISC-V yet, we rely on community builds and manual packaging.

## Prerequisites

### 1. Node.js (riscv64)
Official Node.js builds for RISC-V are not always available or up-to-date. We recommend using the unofficial builds which are tested on actual RISC-V hardware.

*   **Download Source**: [gounthar/unofficial-builds](https://github.com/gounthar/unofficial-builds/releases)
*   **Recommendation**: Download the latest `.deb` package (e.g., v22.x or v24.x) and install it:
    ```bash
    wget https://github.com/gounthar/unofficial-builds/releases/download/v24.12.0/nodejs-unofficial_24.12.0-1_riscv64.deb
    sudo dpkg -i nodejs-unofficial_*.deb
    ```

### 2. Electron Binary (riscv64)
You need a pre-built Electron binary for RISC-V.
*   **Download Source**: [riscv-forks/electron-riscv-releases](https://github.com/riscv-forks/electron-riscv-releases/releases)
*   **Version**: Ensure you download a version matching our `package.json` (currently **v39.2.7** or compatible v39.x).
*   **Setup**:
    1.  Download `electron-v39.2.7-linux-riscv64.zip`.
    2.  Extract it to a known location (e.g., `~/electron-riscv`).
    3.  This folder will serve as the "host" for our application.

### 3. System Dependencies
Install build tools required for compiling native modules (like `node-pty`, `serialport`) and runtime libraries.

```bash
sudo apt update
sudo apt install build-essential python3 pkg-config libsecret-1-dev
```

*Note: Building native modules requires significant RAM. If you have <8GB RAM, we strongly recommend setting up a 4GB Swap file to avoid compilation crashes.*

## Building & Packaging

We provide scripts to automate the build and packaging process.

### 1. Build and Generate `.deb` Packages (Recommended)
This method generates ready-to-install Debian packages.

1.  **Clone & Install Dependencies**:
    ```bash
    git clone https://github.com/your-repo/netcatty.git
    cd netcatty
    npm install
    ```

2.  **Set Environment Variable**:
    Tell the script where your Electron binary is located.
    ```bash
    export ELECTRON_RISCV_DIST="$HOME/electron-riscv"
    ```

3.  **Run the Build Script**:
    ```bash
    ./scripts/pack-riscv.sh   # Generates app.asar
    ./scripts/mkdeb-riscv.sh  # Generates .deb packages
    ```

    This will produce two packages in the `release/` directory:
    *   `netcatty_x.x.x_riscv64.deb`: Standard version.
    *   `netcatty-debug_x.x.x_riscv64.deb`: **Safe Mode version** (runs with `--disable-gpu --no-sandbox`).

### 2. Installation
Install the package suitable for your board.

*   **For most RISC-V boards (Spacemit K1, Lichee Pi 4A, etc.)**:
    The GPU drivers might be unstable with Electron. Use the **debug** package if you encounter rendering issues (black screen, flickering).
    ```bash
    sudo dpkg -i release/netcatty-debug_*.deb
    ```

*   **For boards with working GPU acceleration**:
    ```bash
    sudo dpkg -i release/netcatty_*.deb
    ```

## Troubleshooting

### "Bus error" or Compilation Crashes
This usually means you ran out of memory during `npm install` or `npm rebuild`.
**Fix**: Add Swap space.
```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### "Cannot find module .../pty.node"
This happens if the native modules were compiled for the system Node.js version instead of Electron's internal Node.js version.
**Fix**: Rebuild native modules for Electron.
```bash
# Inside netcatty directory
export npm_config_runtime=electron
export npm_config_target=39.2.7 # Match your Electron version
export npm_config_disturl=https://electronjs.org/headers
npm rebuild @serialport/bindings-cpp node-pty --build-from-source
```

### Graphical Glitches / Black Window
Electron often has trouble with current RISC-V GPU drivers (PowerVR, Imagination, etc.).
**Fix**: Run with GPU disabled.
```bash
netcatty --disable-gpu --no-sandbox
```
*Note: The `netcatty-debug` package applies these flags automatically.*
