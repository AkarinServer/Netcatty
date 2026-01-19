<p align="center">
  <img src="public/icon.png" alt="Netcatty" width="128" height="128">
</p>

<h1 align="center">Netcatty</h1>

<p align="center">
  <strong>现代化 SSH 客户端、SFTP 浏览器 & 终端管理器</strong><br/>
  <a href="https://netcatty.app"><strong>netcatty.app</strong></a>
</p>

<p align="center">
  一个基于 Electron、React 和 xterm.js 构建的功能丰富的 SSH 工作空间。<br/>
  主机管理、分屏终端、SFTP、端口转发、云同步 —— 一应俱全。
</p>

<p align="center">
  <a href="https://github.com/binaricat/Netcatty/releases/latest"><img alt="GitHub Release" src="https://img.shields.io/github/v/release/binaricat/Netcatty?style=for-the-badge&logo=github&label=Release"></a>
  &nbsp;
  <a href="#"><img alt="Platform" src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows-blue?style=for-the-badge&logo=electron"></a>
  &nbsp;
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/License-GPL--3.0-green?style=for-the-badge"></a>
</p>

<p align="center">
  <a href="https://github.com/binaricat/Netcatty/releases/latest">
    <img src="https://img.shields.io/github/v/release/binaricat/Netcatty?style=for-the-badge&logo=github&label=下载最新版&color=success" alt="下载最新版">
  </a>
</p>

<p align="center">
  <a href="https://ko-fi.com/binaricat">
    <img src="https://cdn.ko-fi.com/cdn/kofi3.png?v=2" width="150" alt="在 Ko-fi 上支持我">
  </a>
</p>

<p align="center">
  <a href="./README.md">English</a> · <a href="./README.zh-CN.md">简体中文</a> · <a href="./README.ja-JP.md">日本語</a>
</p>

---

[![Netcatty 主界面](screenshots/vault_grid_view.png)](screenshots/vault_grid_view.png)

---

# 目录 <!-- omit in toc -->

- [Netcatty 是什么](#netcatty-是什么)
- [功能特性](#功能特性)
- [界面截图](#界面截图)
  - [主机管理](#主机管理)
  - [终端](#终端)
  - [SFTP](#sftp)
  - [密钥管理](#密钥管理)
  - [端口转发](#端口转发)
  - [云同步](#云同步)
  - [主题与定制](#主题与定制)
- [支持的发行版](#支持的发行版)
- [快速开始](#快速开始)
- [构建与打包](#构建与打包)
- [技术栈](#技术栈)
- [参与贡献](#参与贡献)
- [开源协议](#开源协议)

---

<a name="netcatty-是什么"></a>
# Netcatty 是什么

**Netcatty** 是一款现代化的跨平台 SSH 客户端和终端管理器，专为需要高效管理多台远程服务器的开发者、系统管理员和 DevOps 工程师设计。

- **Netcatty 是** PuTTY、Termius、SecureCRT 和 macOS Terminal.app 的现代替代品
- **Netcatty 是** 一个强大的 SFTP 客户端，支持双窗格文件浏览
- **Netcatty 是** 一个终端工作空间，支持分屏、标签页和会话管理
- **Netcatty 不是** Shell 替代品 —— 它通过 SSH/Telnet 或本地终端连接到远程 Shell

---

<a name="功能特性"></a>
# 功能特性

### 🖥️ 终端与会话
- **基于 xterm.js 的终端**，支持 GPU 加速渲染
- **分屏功能** —— 水平和垂直分割，多任务并行
- **标签页管理** —— 多会话支持，拖拽排序
- **会话持久化** —— 重启后恢复会话
- **广播模式** —— 一次输入，发送到多个终端

### 🔐 SSH 客户端
- **SSH2 协议**，完整的认证支持
- **密码和密钥认证**
- **SSH 证书**支持
- **跳板机 / 堡垒机** —— 多主机链式连接
- **代理支持** —— HTTP CONNECT 和 SOCKS5 代理
- **Agent 转发** —— 支持 OpenSSH Agent 和 Pageant
- **环境变量** —— 为每个主机设置自定义环境变量

### 📁 SFTP
- **双窗格文件浏览器** —— 本地 ↔ 远程 或 远程 ↔ 远程
- **拖放传输** 文件
- **队列管理** 批量传输
- **进度跟踪** 显示传输速度

### 🔑 密钥管理
- **生成 SSH 密钥** —— RSA、ECDSA、ED25519
- **导入已有密钥** —— PEM、OpenSSH 格式
- **SSH 证书**支持
- **身份管理** —— 可复用的用户名 + 认证方式组合
- **导出公钥**到远程主机

### 🔌 端口转发
- **本地转发** —— 将远程服务暴露到本地
- **远程转发** —— 将本地服务暴露到远程
- **动态转发** —— SOCKS5 代理
- **可视化隧道管理**

### ☁️ 云同步
- **端到端加密同步** —— 数据在离开设备前加密
- **多种存储后端** —— GitHub Gist、S3 兼容存储、WebDAV、Google Drive、OneDrive
- **同步主机、密钥、代码片段和设置**

### 🎨 主题与定制
- **浅色 & 深色模式**
- **自定义强调色**
- **50+ 终端配色方案**
- **字体自定义** —— JetBrains Mono、Fira Code 等
- **多语言支持** —— English、简体中文 等

---

<a name="界面截图"></a>
# 界面截图

<a name="主机管理"></a>
## 主机管理

Vault 视图是管理所有 SSH 连接的控制中心。通过右键菜单创建层级分组，在分组间拖拽主机，使用面包屑导航快速遍历主机树。每个主机显示连接状态、操作系统图标和快速连接按钮。根据偏好在网格和列表视图之间切换，使用强大的搜索按名称、主机名、标签或分组过滤主机。

**深色模式**

![主机管理](screenshots/vault_grid_view.png)

**层级文件夹与分组**

![层级文件夹](screenshots/nested_folder_structure.png)

**列表视图**

![列表视图](screenshots/vault_list_view.png)

<a name="终端"></a>
## 终端

基于 xterm.js 的 WebGL 加速终端，提供流畅、响应迅速的体验。水平或垂直分割工作区，同时监控多个会话。启用广播模式可一次向所有终端发送命令 —— 非常适合批量管理。主题定制面板提供 50+ 配色方案和实时预览、可调节字号以及多种字体选择，包括 JetBrains Mono 和 Fira Code。

**分屏窗口**

**广播模式**

一次输入，多处执行。非常适合同时维护这多台服务器。

![广播模式](screenshots/broadcast_mode.png)

**性能信息与定制**

监控连接健康状况，并自定义终端的方方面面。

![终端性能](screenshots/terminal_performance.png)

<a name="sftp"></a>
## SFTP

双窗格 SFTP 浏览器支持本地到远程和远程到远程的文件传输。单击导航目录，在窗格之间拖放文件，实时监控传输进度。界面显示文件权限、大小和修改日期。批量传输队列管理，详细的速度和进度指示器。右键菜单快速访问重命名、删除、下载和上传操作。

![SFTP 双窗格](screenshots/sftp_dual_pane.png)

**传输队列**

![传输队列](screenshots/sftp_transfer_queue.png)

<a name="密钥管理"></a>
## 密钥管理

密钥库是您存储 SSH 凭证的安全保险库。生成新密钥、导入已有密钥或管理企业认证的 SSH 证书。

| 密钥类型 | 算法 | 推荐用途 |
|---------|------|---------|
| **ED25519** | EdDSA | 现代、快速、最安全（推荐） |
| **ECDSA** | NIST P-256/384/521 | 安全性好、广泛支持 |
| **RSA** | RSA 2048/4096 | 旧版兼容、通用支持 |
| **证书** | CA 签名 | 企业环境、短期认证 |

**功能：**
- 🔑 生成可自定义位长的密钥
- 📥 导入 PEM/OpenSSH 格式密钥
- 👤 创建可复用身份（用户名 + 认证方式）
- 📤 一键导出公钥到远程主机

![密钥管理器](screenshots/key-manager.png)

**密钥生成器**

![密钥生成器](screenshots/key_generator_ui.png)

<a name="端口转发"></a>
## 端口转发

通过直观的可视化界面设置 SSH 隧道。每个隧道显示实时状态，清晰指示活动、连接中或错误状态。保存隧道配置以便跨会话快速复用。

| 类型 | 方向 | 使用场景 | 示例 |
|-----|-----|---------|-----|
| **本地** | 远程 → 本地 | 在本机访问远程服务 | 将远程 MySQL `3306` 转发到 `localhost:3306` |
| **远程** | 本地 → 远程 | 与远程服务器共享本地服务 | 将本地开发服务器暴露给远程机器 |
| **动态** | SOCKS5 代理 | 通过 SSH 隧道安全浏览 | 通过加密 SSH 连接浏览互联网 |

![端口转发](screenshots/port-forwadring.png)

<a name="云同步"></a>
## 云同步

通过端到端加密在所有设备间同步主机、密钥、代码片段和设置。主密码在上传前本地加密所有数据 —— 云服务商永远看不到明文。

| 服务商 | 最适合 | 配置复杂度 |
|-------|-------|----------|
| **GitHub Gist** | 快速设置、版本历史 | ⭐ 简单 |
| **Google Drive** | 个人使用、大容量存储 | ⭐ 简单 |
| **OneDrive** | 微软生态用户 | ⭐ 简单 |
| **S3 兼容存储** | AWS、MinIO、Cloudflare R2、自托管 | ⭐⭐ 中等 |
| **WebDAV** | Nextcloud、ownCloud、自托管 | ⭐⭐ 中等 |

**同步内容：**
- ✅ 主机与连接设置
- ✅ SSH 密钥与证书
- ✅ 身份与凭证
- ✅ 代码片段与脚本
- ✅ 自定义分组与标签
- ✅ 端口转发规则
- ✅ 应用程序偏好设置

![云同步](screenshots/cloud-sync.png)

<a name="主题与定制"></a>
## 主题与定制

让 Netcatty 真正属于你。在浅色和深色模式之间切换，或让应用跟随系统偏好。选择任意强调色来匹配你的风格。应用支持多种语言，包括 English 和简体中文，欢迎社区贡献更多翻译。启用云同步后，所有偏好设置都会跨设备同步，个性化体验随处可用。

![主题与国际化](screenshots/app-themes-i18n.png)

---

<a name="支持的发行版"></a>
# 支持的发行版

Netcatty 自动检测并显示已连接主机的操作系统图标：

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

<a name="快速开始"></a>
# 快速开始

### 下载

从 [GitHub Releases](https://github.com/binaricat/Netcatty/releases/latest) 下载适合您平台的最新版本。

| 平台 | 架构 | 状态 |
|------|------|------|
| **macOS** | Apple Silicon (M1/M2/M3) | ✅ 支持 |
| **macOS** | Intel | ✅ 支持 |
| **Windows** | x64 | ✅ 支持 |

或在 [GitHub Releases](https://github.com/binaricat/Netcatty/releases) 浏览所有版本。

> **⚠️ macOS 用户注意：** 由于应用未经代码签名，macOS Gatekeeper 会阻止运行。下载后，请在终端运行以下命令移除隔离属性：
> ```bash
> xattr -cr /Applications/Netcatty.app
> ```
> 或者右键点击应用 → 打开 → 在弹出的对话框中点击"打开"。

### 前置条件
- Node.js 18+ 和 npm
- macOS、Windows 10+ 或 Linux

### 开发

```bash
# 克隆仓库
git clone https://github.com/binaricat/Netcatty.git
cd Netcatty

# 安装依赖
npm install

# 启动开发模式（Vite + Electron）
npm run dev
```

### 项目结构

```
├── App.tsx                 # 主 React 应用
├── components/             # React 组件
│   ├── Terminal.tsx        # 终端组件
│   ├── SftpView.tsx        # SFTP 浏览器
│   ├── VaultView.tsx       # 主机管理
│   ├── KeyManager.tsx      # SSH 密钥管理
│   └── ...
├── application/            # 状态管理 & 国际化
├── domain/                 # 领域模型 & 逻辑
├── infrastructure/         # 服务 & 适配器
├── electron/               # Electron 主进程
│   ├── main.cjs            # 主入口
│   └── bridges/            # IPC 桥接
└── public/                 # 静态资源 & 图标
```

---

<a name="构建与打包"></a>
# 构建与打包

```bash
# 生产构建
npm run build

# 为当前平台打包
npm run pack

# 为特定平台打包
npm run pack:mac     # macOS (DMG + ZIP)
npm run pack:win     # Windows (NSIS 安装程序)
npm run pack:linux   # Linux (AppImage, deb, rpm)
```

---

<a name="技术栈"></a>
# 技术栈

| 分类 | 技术 |
|-----|-----|
| 框架 | Electron 39 |
| 前端 | React 19, TypeScript |
| 构建工具 | Vite 7 |
| 终端 | xterm.js 5 |
| 样式 | Tailwind CSS 4 |
| SSH/SFTP | ssh2, ssh2-sftp-client |
| PTY | node-pty |
| 图标 | Lucide React |

---

<a name="参与贡献"></a>
# 参与贡献

欢迎贡献！请随时提交 Pull Request。

1. Fork 本仓库
2. 创建你的功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交你的更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 打开一个 Pull Request

查看 [agents.md](agents.md) 了解架构概述和编码规范。

---

<a name="贡献者"></a>
# 贡献者

感谢所有参与贡献的人！

<a href="https://github.com/binaricat/Netcatty/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=binaricat/Netcatty" alt="contributors" />
</a>

---

<a name="开源协议"></a>
# 开源协议

本项目采用 **GPL-3.0 协议** 开源 - 查看 [LICENSE](LICENSE) 文件了解详情。

---

<p align="center">
  用 ❤️ 制作，作者 <a href="https://ko-fi.com/binaricat">binaricat</a>
</p>
