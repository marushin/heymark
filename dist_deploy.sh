#!/bin/bash
# hey, mark! macOS Deployment Asset Collector
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "========================================"
echo "hey, mark! macOS Deployment Collector"
echo "========================================"

VERSION=$(node -p "require('./src-tauri/tauri.conf.json').version")

if [ -z "$VERSION" ]; then
    echo "[ERROR] Could not detect version from tauri.conf.json"
    exit 1
fi

echo "Detected Version: v${VERSION}"
RELEASE_DIR="releases/v${VERSION}"
mkdir -p "$RELEASE_DIR"

echo ""
echo "[1/2] Copying macOS DMG installer..."
DMG_SRC=$(find src-tauri/target/release/bundle/dmg -name "*_${VERSION}_*.dmg" 2>/dev/null | head -n 1)
if [ -n "$DMG_SRC" ] && [ -f "$DMG_SRC" ]; then
    cp -f "$DMG_SRC" "$RELEASE_DIR/"
    echo "  [OK] DMG copied: $(basename "$DMG_SRC")"
else
    echo "  [INFO] No DMG file found in src-tauri/target/release/bundle/dmg"
fi

echo ""
echo "[2/2] Copying macOS Application bundle..."
APP_SRC="src-tauri/target/release/bundle/macos/hey, mark!.app"
if [ -d "$APP_SRC" ]; then
    ZIP_NAME="heymark_${VERSION}_mac.zip"
    ditto -c -k --sequesterRsrc --keepParent "$APP_SRC" "$RELEASE_DIR/$ZIP_NAME"
    echo "  [OK] .app compressed to: $ZIP_NAME"
else
    echo "  [INFO] .app bundle not found in src-tauri/target/release/bundle/macos"
fi

echo ""
echo "========================================"
echo "Deployment assets collection finished!"
echo "Location: $RELEASE_DIR"
echo "========================================"

