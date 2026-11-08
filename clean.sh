#!/bin/bash
# hey, mark! macOS Clean Remnants
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "========================================="
echo "Cleaning build remnants (dist, target)..."
echo "Core files are safe and will not be touched."
echo "========================================="

echo "[1/2] Removing dist..."
rm -rf dist

echo "[2/2] Removing src-tauri/target..."
rm -rf src-tauri/target

echo "========================================="
echo "Cleanup completed safely!"
echo "========================================="

