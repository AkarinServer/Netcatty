/* global __dirname */
const path = require('path');

/**
 * @type {import('electron-builder').Configuration}
 */
module.exports = {
    appId: 'com.netcatty.app',
    productName: 'Netcatty',
    artifactName: '${productName}-${version}-${os}-${arch}.${ext}',
    icon: 'public/icon.png',
    directories: {
        buildResources: 'build',
        output: 'release'
    },
    files: [
        'dist/**/*',
        'electron/**/*',
        '!electron/.dev-config.json',
        'public/**/*',
        'node_modules/**/*'
    ],
    asarUnpack: [
        'node_modules/node-pty/**/*',
        'node_modules/ssh2/**/*',
        'node_modules/cpu-features/**/*'
    ],
    mac: {
        target: [
            {
                target: 'dmg',
                arch: ['arm64', 'x64']
            },
            {
                target: 'zip',
                arch: ['arm64', 'x64']
            }
        ],
        category: 'public.app-category.developer-tools',
        hardenedRuntime: false,
        gatekeeperAssess: false,
        entitlements: 'electron/entitlements.mac.plist',
        entitlementsInherit: 'electron/entitlements.mac.plist',
        extendInfo: {
            NSCameraUsageDescription: 'Netcatty may use the camera for video calls',
            NSMicrophoneUsageDescription: 'Netcatty may use the microphone for audio',
            NSLocalNetworkUsageDescription: 'Netcatty needs local network access for SSH connections'
        }
    },
    dmg: {
        title: '${productName}',
        background: 'public/dmg-background.jpg',
        iconSize: 100,
        iconTextSize: 12,
        window: {
            width: 672,
            height: 500
        },
        contents: [
            { x: 150, y: 158 },
            { x: 550, y: 158, type: 'link', path: '/Applications' },
            {
                x: 350,
                y: 330,
                type: 'file',
                // Use absolute path resolved at build time
                path: path.resolve(__dirname, 'scripts/FixQuarantine.app'),
                name: '已损坏修复.app'
            }
        ]
    },
    win: {
        target: [
            {
                target: 'nsis',
                arch: ['x64']
            },
            {
                target: 'dir',
                arch: ['x64']
            }
        ]
    },
    nsis: {
        oneClick: false,
        perMachine: false,
        allowElevation: true,
        allowToChangeInstallationDirectory: true,
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        shortcutName: 'Netcatty'
    },
    linux: {
        target: [
            {
                target: 'AppImage',
                arch: ['x64', 'arm64']
            },
            {
                target: 'deb',
                arch: ['x64', 'arm64']
            },
            {
                target: 'rpm',
                arch: ['x64', 'arm64']
            }
        ],
        category: 'Development'
    }
};
