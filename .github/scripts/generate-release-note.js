const fs = require('fs');
const path = require('path');

// Determine version: prefer VERSION env, then check if GITHUB_REF_NAME is a valid version tag,
// otherwise fall back to package.json version to match electron-builder artifacts
function getVersion() {
  if (process.env.VERSION) {
    return process.env.VERSION;
  }

  const refName = process.env.GITHUB_REF_NAME;
  // Check if refName is a valid version tag (e.g., v1.2.3)
  if (refName && /^v\d+\.\d+\.\d+/.test(refName)) {
    return refName.replace(/^v/, '');
  }

  // Fall back to package.json version (matches electron-builder artifacts)
  try {
    const pkgPath = path.join(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}

const version = getVersion();
const repo = process.env.GITHUB_REPOSITORY || 'binaricat/netcatty';
// For tag releases, use the tag; for workflow_dispatch, create a tag from version
const tag = (process.env.GITHUB_REF_NAME && /^v\d+\.\d+\.\d+/.test(process.env.GITHUB_REF_NAME))
  ? process.env.GITHUB_REF_NAME
  : `v${version}`;
const baseUrl = `https://github.com/${repo}/releases/download/${tag}`;

// Filename patterns based on electron-builder.config.cjs artifactName: '${productName}-${version}-${os}-${arch}.${ext}'
const files = {
  mac: {
    arm64: `Netcatty-${version}-mac-arm64.dmg`,
    x64: `Netcatty-${version}-mac-x64.dmg`
  },
  win: {
    x64: `Netcatty-${version}-win-x64.exe`,
    arm64: `Netcatty-${version}-win-arm64.exe`
  },
  linux: {
    appimage: {
      x64: `Netcatty-${version}-linux-x64.AppImage`,
      arm64: `Netcatty-${version}-linux-arm64.AppImage`
    },
    deb: {
      x64: `Netcatty-${version}-linux-x64.deb`,
      arm64: `Netcatty-${version}-linux-arm64.deb`
    },
    rpm: {
      x64: `Netcatty-${version}-linux-x64.rpm`,
      arm64: `Netcatty-${version}-linux-arm64.rpm`
    }
  }
};

const badges = {
  win: {
    setup_x64: `[![Setup x64](https://img.shields.io/badge/Setup-x64-0078D6?style=flat-square&logo=windows)](${baseUrl}/${files.win.x64})`,
    setup_arm64: `[![Setup arm64](https://img.shields.io/badge/Setup-arm64-0078D6?style=flat-square&logo=windows)](${baseUrl}/${files.win.arm64})`
  },
  mac: {
    apple_silicon: `[![DMG Apple Silicon](https://img.shields.io/badge/DMG-Apple_Silicon-000000?style=flat-square&logo=apple)](${baseUrl}/${files.mac.arm64})`,
    intel: `[![DMG Intel X64](https://img.shields.io/badge/DMG-Intel_X64-000000?style=flat-square&logo=apple)](${baseUrl}/${files.mac.x64})`
  },
  linux: {
    appimage_x64: `[![AppImage x64](https://img.shields.io/badge/AppImage-x64-FCC624?style=flat-square&logo=linux)](${baseUrl}/${files.linux.appimage.x64})`,
    appimage_arm64: `[![AppImage arm64](https://img.shields.io/badge/AppImage-arm64-FCC624?style=flat-square&logo=linux)](${baseUrl}/${files.linux.appimage.arm64})`,
    deb_x64: `[![DebPackage x64](https://img.shields.io/badge/DebPackage-x64-A80030?style=flat-square&logo=debian)](${baseUrl}/${files.linux.deb.x64})`,
    deb_arm64: `[![DebPackage arm64](https://img.shields.io/badge/DebPackage-arm64-A80030?style=flat-square&logo=debian)](${baseUrl}/${files.linux.deb.arm64})`,
    rpm_x64: `[![RpmPackage x64](https://img.shields.io/badge/RpmPackage-x64-CC0000?style=flat-square&logo=redhat)](${baseUrl}/${files.linux.rpm.x64})`,
    rpm_arm64: `[![RpmPackage arm64](https://img.shields.io/badge/RpmPackage-arm64-CC0000?style=flat-square&logo=redhat)](${baseUrl}/${files.linux.rpm.arm64})`
  }
};

const content = `
## Download based on your OS:

| OS | Download |
| :--- | :--- |
| **Windows** | ${badges.win.setup_x64} ${badges.win.setup_arm64} |
| **macOS** | ${badges.mac.apple_silicon} ${badges.mac.intel} |
| **Linux** | ${badges.linux.appimage_x64} ${badges.linux.deb_x64} ${badges.linux.rpm_x64} <br> ${badges.linux.appimage_arm64} ${badges.linux.deb_arm64} ${badges.linux.rpm_arm64} |
`;

fs.writeFileSync('release_notes.md', content);
console.log('Generated release_notes.md');
