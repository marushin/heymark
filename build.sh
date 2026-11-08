#!/bin/bash
# hey, mark! macOS Production Build
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# Source environment
[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"
[ -f "$HOME/.local/bin/env" ] && . "$HOME/.local/bin/env"

echo "========================================"
echo "hey, mark! macOS Production Build"
echo "========================================"
echo ""
echo "[1/2] Checking dependencies..."
npm ci

echo ""
echo "[2/2] Building Tauri macOS Bundle (.app / .dmg)..."
npm run tauri build

echo ""
echo "========================================"
echo "Build Completed Successfully!"
echo "========================================"
echo "Output files can be found in:"
echo "src-tauri/target/release/bundle/dmg/"
echo "src-tauri/target/release/bundle/macos/"
echo ""

