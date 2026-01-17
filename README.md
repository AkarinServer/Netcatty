<p align="center">
  <img src="public/icon.png" alt="Netcatty" width="128" height="128">
</p>

<h1 align="center">Netcatty</h1>

<p align="center">
  <strong>Modern SSH Client, SFTP Browser & Terminal Manager</strong><br/>
  <a href="https://netcatty.app"><strong>netcatty.app</strong></a>
</p>

<p align="center">
  A beautiful, feature-rich SSH workspace built with Electron, React, and xterm.js.<br/>
  Host management, split terminals, SFTP, port forwarding, and cloud sync — all in one.
</p>

<p align="center">
  <a href="https://github.com/binaricat/Netcatty/releases/latest"><img alt="GitHub Release" src="https://img.shields.io/github/v/release/binaricat/Netcatty?style=for-the-badge&logo=github&label=Release"></a>
  &nbsp;
  <a href="#"><img alt="Platform" src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-blue?style=for-the-badge&logo=electron"></a>
  &nbsp;
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/License-GPL--3.0-green?style=for-the-badge"></a>
</p>

<p align="center">
  <a href="https://github.com/binaricat/Netcatty/releases/latest">
    <img src="https://img.shields.io/github/v/release/binaricat/Netcatty?style=for-the-badge&logo=github&label=Download%20Latest&color=success" alt="Download Latest Release">
  </a>
</p>

<p align="center">
  <a href="https://ko-fi.com/binaricat">
    <img src="https://cdn.ko-fi.com/cdn/kofi3.png?v=2" width="150" alt="Support on Ko-fi">
  </a>
</p>

<p align="center">
  <a href="./README.md">English</a> · <a href="./README.zh-CN.md">简体中文</a> · <a href="./README.ja-JP.md">日本語</a>
</p>

---

[![Netcatty Main Interface](screenshots/vault_grid_view.png)](screenshots/vault_grid_view.png)

---

# Contents <!-- omit in toc -->

- [What is Netcatty](#what-is-netcatty)
- [Features](#features)
- [Screenshots](#screenshots)
  - [Host Management](#host-management)
  - [Terminal](#terminal)
  - [SFTP](#sftp)
  - [Keychain](#keychain)
  - [Port Forwarding](#port-forwarding)
  - [Cloud Sync](#cloud-sync)
  - [Themes & Customization](#themes--customization)
- [Supported Distros](#supported-distros)
- [Getting Started](#getting-started)
- [Build & Package](#build--package)
- [Tech Stack](#tech-stack)
- [Contributing](#contributing)
- [License](#license)

---

<a name="what-is-netcatty"></a>
# What is Netcatty

**Netcatty** is a modern SSH client and terminal manager for macOS, Windows, and Linux, designed for developers, sysadmins, and DevOps engineers who need to manage multiple remote servers efficiently.

- **Netcatty is** an alternative to PuTTY, Termius, SecureCRT, and macOS Terminal.app for SSH connections
- **Netcatty is** a powerful SFTP client with dual-pane file browser
- **Netcatty is** a terminal workspace with split panes, tabs, and session management
- **Netcatty is not** a shell replacement — it connects to remote shells via SSH/Telnet or local terminals

---

<a name="features"></a>
# Features

### 🖥️ Terminal & Sessions
- **xterm.js-based terminal** with GPU-accelerated rendering
- **Split panes** — horizontal and vertical splits for multi-tasking
- **Tab management** — multiple sessions with drag-to-reorder
- **Session persistence** — restore sessions on restart
- **Broadcast mode** — type once, send to multiple terminals

### 🔐 SSH Client
- **SSH2 protocol** with full authentication support
- **Password & key-based authentication**
- **SSH certificates** support
- **Jump hosts / Bastion** — chain through multiple hosts
- **Proxy support** — HTTP CONNECT and SOCKS5 proxies
- **Agent forwarding** — including OpenSSH Agent and Pageant
- **Environment variables** — set custom env vars per host

### 📁 SFTP
- **Dual-pane file browser** — local ↔ remote or remote ↔ remote
- **Drag & drop** file transfers
- **Queue management** for batch transfers
- **Progress tracking** with transfer speed

### 🔑 Keychain
- **Generate SSH keys** — RSA, ECDSA, ED25519
- **Import existing keys** — PEM, OpenSSH formats
- **SSH certificates** support
- **Identity management** — reusable username + auth combinations
- **Export public keys** to remote hosts

### 🔌 Port Forwarding
- **Local forwarding** — expose remote services locally
- **Remote forwarding** — expose local services remotely
- **Dynamic forwarding** — SOCKS5 proxy
- **Visual tunnel management**

### ☁️ Cloud Sync
- **End-to-end encrypted sync** — your data is encrypted before leaving your device
- **Multiple providers** — GitHub Gist, S3-compatible storage, WebDAV, Google Drive, OneDrive
- **Sync hosts, keys, snippets, and settings**

### 🎨 Themes & Customization
- **Light & Dark mode**
- **Custom accent colors**
- **50+ terminal color schemes**
- **Font customization** — JetBrains Mono, Fira Code, and more
- **i18n support** — English, 简体中文, and more

---

<a name="screenshots"></a>
# Screenshots

<a name="host-management"></a>
## Host Management

The Vault view is your command center for managing all SSH connections. Create hierarchical groups with right-click context menus, drag hosts between groups, and use breadcrumb navigation to quickly traverse your host tree. Each host displays its connection status, OS icon, and quick-connect button. Switch between grid and list views based on your preference, and use the powerful search to filter hosts by name, hostname, tags, or group.

**Dark Mode**

![Host Management](screenshots/vault_grid_view.png)

**Nested Folders & Organization**

![Nested Folders](screenshots/nested_folder_structure.png)

**List View**

![List View](screenshots/vault_list_view.png)

<a name="terminal"></a>
## Terminal

Powered by xterm.js with WebGL acceleration, the terminal delivers a smooth, responsive experience. Split your workspace horizontally or vertically to monitor multiple sessions simultaneously. Enable broadcast mode to send commands to all terminals at once — perfect for fleet management. The theme customization panel offers 50+ color schemes with live preview, adjustable font size, and multiple font family options including JetBrains Mono and Fira Code.

**Split Windows**

**Broadcast Mode**

Type once, execute everywhere. Great for maintaining multiple servers simultaneously.

![Broadcast Mode](screenshots/broadcast_mode.png)

**Performance Info & Customization**

Monitor your connection health and customize every aspect of your terminal.

![Terminal Performance](screenshots/terminal_performance.png)

<a name="sftp"></a>
## SFTP

The dual-pane SFTP browser supports local-to-remote and remote-to-remote file transfers. Navigate directories with single-click, drag files between panes, and monitor transfer progress in real-time. The interface shows file permissions, sizes, and modification dates. Queue multiple transfers and watch them complete with detailed speed and progress indicators. Context menus provide quick access to rename, delete, download, and upload operations.

![SFTP Dual Pane](screenshots/sftp_dual_pane.png)

**Transfer Queue**

![Transfer Queue](screenshots/sftp_transfer_queue.png)

<a name="keychain"></a>
## Keychain

The Keychain is your secure vault for SSH credentials. Generate new keys, import existing ones, or manage SSH certificates for enterprise authentication.

| Key Type | Algorithm | Recommended Use |
|----------|-----------|----------------|
| **ED25519** | EdDSA | Modern, fast, most secure (recommended) |
| **ECDSA** | NIST P-256/384/521 | Good security, widely supported |
| **RSA** | RSA 2048/4096 | Legacy compatibility, universal support |
| **Certificate** | CA-signed | Enterprise environments, short-lived auth |

**Features:**
- 🔑 Generate keys with customizable bit lengths
- 📥 Import PEM/OpenSSH format keys
- 👤 Create reusable identities (username + auth method)
- 📤 One-click export public keys to remote hosts

![Key Manager](screenshots/key-manager.png)

**Key Generator**

![Key Generator](screenshots/key_generator_ui.png)

<a name="port-forwarding"></a>
## Port Forwarding

Set up SSH tunnels with an intuitive visual interface. Each tunnel shows real-time status with clear indicators for active, connecting, or error states. Save tunnel configurations for quick reuse across sessions.

| Type | Direction | Use Case | Example |
|------|-----------|----------|--------|
| **Local** | Remote → Local | Access remote services on your machine | Forward remote MySQL `3306` to `localhost:3306` |
| **Remote** | Local → Remote | Share local services with remote server | Expose local dev server to remote machine |
| **Dynamic** | SOCKS5 Proxy | Secure browsing through SSH tunnel | Browse internet via encrypted SSH connection |

![Port Forwarding](screenshots/port-forwadring.png)

<a name="cloud-sync"></a>
## Cloud Sync

Keep your hosts, keys, snippets, and settings synchronized across all your devices with end-to-end encryption. Your master password encrypts all data locally before upload — the cloud provider never sees plaintext.

| Provider | Best For | Setup Complexity |
|----------|----------|------------------|
| **GitHub Gist** | Quick setup, version history | ⭐ Easy |
| **Google Drive** | Personal use, large storage | ⭐ Easy |
| **OneDrive** | Microsoft ecosystem users | ⭐ Easy |
| **S3-Compatible** | AWS, MinIO, Cloudflare R2, self-hosted | ⭐⭐ Medium |
| **WebDAV** | Nextcloud, ownCloud, self-hosted | ⭐⭐ Medium |

**What syncs:**
- ✅ Hosts & connection settings
- ✅ SSH keys & certificates
- ✅ Identities & credentials
- ✅ Snippets & scripts
- ✅ Custom groups & tags
- ✅ Port forwarding rules
- ✅ Application preferences

![Cloud Sync](screenshots/cloud-sync.png)

<a name="themes--customization"></a>
## Themes & Customization

Make Netcatty truly yours with extensive customization options. Toggle between light and dark modes, or let the app follow your system preference. Pick any accent color to match your style. The application supports multiple languages including English and 简体中文, with more translations welcome via community contributions. All preferences sync across devices when cloud sync is enabled, so your personalized experience follows you everywhere.

![Themes & i18n](screenshots/app-themes-i18n.png)

---

<a name="supported-distros"></a>
# Supported Distros

Netcatty automatically detects and displays OS icons for connected hosts:

<p align="center">
  <img src="public/distro/ubuntu.svg" width="48" alt="Ubuntu" title="Ubuntu">
  <img src="public/distro/debian.svg" width="48" alt="Debian" title="Debian">
  <img src="public/distro/centos.svg" width="48" alt="CentOS" title="CentOS">
  <img src="public/distro/fedora.svg" width="48" alt="Fedora" title="Fedora">
  <img src="public/distro/arch.svg" width="48" alt="Arch Linux" title="Arch Linux">
  <img src="public/distro/alpine.svg" width="48" alt="Alpine" title="Alpine">
  <img src="public/distro/amazon.svg" width="48" alt="Amazon Linux" title="Amazon Linux">
  <img src="public/distro/redhat.svg" width="48" alt="Red Hat" title="Red Hat">
  <img src="public/distro/rocky.svg" width="48" alt="Rocky Linux" title="Rocky Linux">
  <img src="public/distro/opensuse.svg" width="48" alt="openSUSE" title="openSUSE">
  <img src="public/distro/oracle.svg" width="48" alt="Oracle Linux" title="Oracle Linux">
  <img src="public/distro/kali.svg" width="48" alt="Kali Linux" title="Kali Linux">
</p>

---

<a name="getting-started"></a>
# Getting Started

### Download

Download the latest release for your platform from [GitHub Releases](https://github.com/binaricat/Netcatty/releases/latest).

| Platform | Architecture | Status |
|----------|--------------|--------|
| **macOS** | Apple Silicon (M1/M2/M3) | ✅ Supported |
| **macOS** | Intel | ✅ Supported |
| **Windows** | x64 | ✅ Supported |

Or browse all releases at [GitHub Releases](https://github.com/binaricat/Netcatty/releases).

> **⚠️ macOS Users:** Since the app is not code-signed, macOS Gatekeeper will block it. After downloading, run this command to remove the quarantine attribute:
> ```bash
> xattr -cr /Applications/Netcatty.app
> ```
> Or right-click the app → Open → Click "Open" in the dialog.

### Prerequisites
- Node.js 18+ and npm
- macOS, Windows 10+, or Linux

### Development

```bash
# Clone the repository
git clone https://github.com/binaricat/Netcatty.git
cd Netcatty

# Install dependencies
npm install

# Start development mode (Vite + Electron)
npm run dev
```

### Project Structure

```
├── App.tsx                 # Main React application
├── components/             # React components
│   ├── Terminal.tsx        # Terminal component
│   ├── SftpView.tsx        # SFTP browser
│   ├── VaultView.tsx       # Host management
│   ├── KeyManager.tsx      # SSH key management
│   └── ...
├── application/            # State management & i18n
├── domain/                 # Domain models & logic
├── infrastructure/         # Services & adapters
├── electron/               # Electron main process
│   ├── main.cjs            # Main entry
│   └── bridges/            # IPC bridges
└── public/                 # Static assets & icons
```

---

<a name="build--package"></a>
# Build & Package

```bash
# Build for production
npm run build

# Package for current platform
npm run pack

# Package for specific platforms
npm run pack:mac     # macOS (DMG + ZIP)
npm run pack:win     # Windows (NSIS installer)
npm run pack:linux   # Linux (AppImage + DEB + RPM)
```

---

<a name="tech-stack"></a>
# Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Electron 39 |
| Frontend | React 19, TypeScript |
| Build Tool | Vite 7 |
| Terminal | xterm.js 5 |
| Styling | Tailwind CSS 4 |
| SSH/SFTP | ssh2, ssh2-sftp-client |
| PTY | node-pty |
| Icons | Lucide React |

---

<a name="contributing"></a>
# Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

See [agents.md](agents.md) for architecture overview and coding conventions.

---

<a name="contributors"></a>
# Contributors

Thanks to all the people who contribute!

<a href="https://github.com/binaricat/Netcatty/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=binaricat/Netcatty" alt="contributors" />
</a>

---

<a name="license"></a>
# License

This project is licensed under the **GPL-3.0 License** - see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Made with ❤️ by <a href="https://ko-fi.com/binaricat">binaricat</a>
</p>
