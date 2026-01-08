#!/bin/bash
set -e

# Load configuration
SCRIPT_DIR=$(dirname "$0")
PROJECT_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)

# Load metadata
if [ -f "$PROJECT_ROOT/scripts/get-config.cjs" ]; then
    eval $(node "$PROJECT_ROOT/scripts/get-config.cjs")
else
    echo "Warning: Config script not found, using defaults."
    APP_NAME="netcatty"
    VERSION="0.0.0"
    PRODUCT_NAME="Netcatty"
    MAINTAINER="binaricat"
    DESCRIPTION="Netcatty SSH Client"
    CATEGORY="Development"
fi

# Configuration
ARCH="riscv64"
DIST_DIR="$PROJECT_ROOT/release/riscv_build"
OUTPUT_ROOT="$PROJECT_ROOT/release"
ELECTRON_BINARY_DIR="${ELECTRON_PATH:-$HOME/electron-riscv}"

echo "----------------------------------------------------------------"
echo "Netcatty RISC-V Build & Pack"
echo "----------------------------------------------------------------"
echo "Product: $PRODUCT_NAME ($APP_NAME)"
echo "Version: $VERSION"
echo "Target Dir: $DIST_DIR"
echo "Electron Source: $ELECTRON_BINARY_DIR"

# Check dependencies
if ! command -v npm >/dev/null 2>&1; then
    echo "Error: npm is not installed."
    exit 1
fi

# ==============================================================================
# Phase 1: Build & Assembly (Assembly)
# ==============================================================================

if [ "$SKIP_ASSEMBLY" != "true" ]; then
    # 1. Build Frontend
    if [ "$SKIP_BUILD" != "true" ]; then
        echo "Building frontend..."
        cd "$PROJECT_ROOT"
        npm run build
    else
        echo "Skipping build step (SKIP_BUILD=true)..."
    fi

    # 2. Prepare Directory Structure
    echo "Cleaning distribution directory..."
    rm -rf "$DIST_DIR"
    mkdir -p "$DIST_DIR/resources/app"

    # 3. Copy Electron Binary
    if [ -f "$ELECTRON_BINARY_DIR/electron" ]; then
        echo "Copying Electron binary and resources from $ELECTRON_BINARY_DIR..."
        rsync -av --exclude 'resources/app' "$ELECTRON_BINARY_DIR/" "$DIST_DIR/"
    else
        echo "Warning: Electron binary not found at $ELECTRON_BINARY_DIR."
        echo "You will need to manually place the 'electron' binary in $DIST_DIR before packaging."
    fi

    # 4. Copy Application Files (No ASAR)
    echo "Copying application files to resources/app..."
    APP_DIR="$DIST_DIR/resources/app"

    cp "$PROJECT_ROOT/package.json" "$APP_DIR/"
    cp -r "$PROJECT_ROOT/electron" "$APP_DIR/"
    cp -r "$PROJECT_ROOT/dist" "$APP_DIR/"

    # 5. Handle node_modules (Clean & Production)
    echo "Handling node_modules..."
    if [ -d "$PROJECT_ROOT/node_modules" ]; then
        echo "Copying node_modules..."
        cp -r "$PROJECT_ROOT/node_modules" "$APP_DIR/"
        
        if [ -f "$APP_DIR/package.json" ]; then
            echo "Pruning development dependencies..."
            cd "$APP_DIR"
            npm prune --production
            cd "$PROJECT_ROOT"
        fi
    else
        echo "Warning: node_modules not found. Skipping."
    fi
else
    echo "Skipping assembly phase (SKIP_ASSEMBLY=true)..."
fi

# ==============================================================================
# Phase 2: Debian Packaging
# ==============================================================================

if [ "$SKIP_DEB" == "true" ]; then
    echo "Skipping Debian package generation (SKIP_DEB=true)."
    echo "Assembly completed at: $DIST_DIR"
    exit 0
fi

SOURCE_DIR="$DIST_DIR"

if [ ! -d "$SOURCE_DIR" ]; then
    echo "Error: Source directory $SOURCE_DIR does not exist."
    exit 1
fi

# Function to build a package
build_package() {
    local PKG_NAME="$1"
    local PKG_SUFFIX="$2" # e.g., "-debug" or empty
    local EXTRA_FLAGS="$3"
    
    local DEB_DIR="$OUTPUT_ROOT/deb_dist_${PKG_NAME}"
    local INSTALL_DIR="/opt/$PKG_NAME"
    
    echo "----------------------------------------------------------------"
    echo "Building package: $PKG_NAME"
    echo "Flags: $EXTRA_FLAGS"
    echo "----------------------------------------------------------------"

    # Clean up previous build
    rm -rf "$DEB_DIR"
    mkdir -p "$DEB_DIR/DEBIAN"
    mkdir -p "$DEB_DIR$INSTALL_DIR"
    mkdir -p "$DEB_DIR/usr/bin"
    mkdir -p "$DEB_DIR/usr/share/applications"
    mkdir -p "$DEB_DIR/usr/share/icons/hicolor/512x512/apps"

    # Copy application files
    echo "Copying application files..."
    cp -r "$SOURCE_DIR/"* "$DEB_DIR$INSTALL_DIR/"
    chmod -R 755 "$DEB_DIR$INSTALL_DIR"

    # Create wrapper script
    echo "Creating wrapper script..."
    if [ -f "$DEB_DIR$INSTALL_DIR/netcatty" ]; then
        BIN_NAME="netcatty"
    elif [ -f "$DEB_DIR$INSTALL_DIR/electron" ]; then
        BIN_NAME="electron"
    else
        BIN_NAME=$(find "$DEB_DIR$INSTALL_DIR" -maxdepth 1 -type f -executable -printf "%s\t%p\n" | sort -n | tail -1 | awk '{print $2}' | xargs basename)
    fi

    mv "$DEB_DIR$INSTALL_DIR/$BIN_NAME" "$DEB_DIR$INSTALL_DIR/$PKG_NAME-bin"
    
    cat > "$DEB_DIR$INSTALL_DIR/$PKG_NAME" <<EOF
#!/bin/bash
exec $INSTALL_DIR/$PKG_NAME-bin $EXTRA_FLAGS "\$@"
EOF
    chmod +x "$DEB_DIR$INSTALL_DIR/$PKG_NAME"

    # Create symlink
    ln -s "$INSTALL_DIR/$PKG_NAME" "$DEB_DIR/usr/bin/$PKG_NAME"

    # Copy icon
    if [ -f "$PROJECT_ROOT/public/icon.png" ]; then
        cp "$PROJECT_ROOT/public/icon.png" "$DEB_DIR/usr/share/icons/hicolor/512x512/apps/$PKG_NAME.png"
    fi

    # Create desktop entry
    echo "Creating desktop entry..."
    cat > "$DEB_DIR/usr/share/applications/$PKG_NAME.desktop" <<EOF
[Desktop Entry]
Name=$PRODUCT_NAME${PKG_SUFFIX}
Exec=$INSTALL_DIR/$PKG_NAME %U
Terminal=false
Type=Application
Icon=$PKG_NAME
StartupWMClass=$PKG_NAME
Comment=$DESCRIPTION
Categories=$CATEGORY;
EOF

    # Create control file
    echo "Creating control file..."
    cat > "$DEB_DIR/DEBIAN/control" <<EOF
Package: $PKG_NAME
Version: $VERSION
Architecture: $ARCH
Maintainer: $MAINTAINER
Description: $DESCRIPTION${PKG_SUFFIX}
EOF

    # Build .deb
    echo "Building .deb..."
    mkdir -p "$OUTPUT_ROOT"
    dpkg-deb --build "$DEB_DIR" "$OUTPUT_ROOT/${PKG_NAME}_${VERSION}_${ARCH}.deb"
    
    # Clean up temp dir
    rm -rf "$DEB_DIR"
    
    echo "Package created: $OUTPUT_ROOT/${PKG_NAME}_${VERSION}_${ARCH}.deb"
}

# Build Normal Package (Standard)
build_package "$APP_NAME" "" "--no-sandbox"

# Build Debug Package (Disable GPU)
build_package "${APP_NAME}-debug" " (Debug)" "--disable-gpu --no-sandbox"

echo "----------------------------------------------------------------"
echo "All builds completed successfully!"
