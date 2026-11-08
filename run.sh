#!/bin/bash
# hey, mark! macOS Development Runner
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# Source environment
[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"
[ -f "$HOME/.local/bin/env" ] && . "$HOME/.local/bin/env"

echo "========================================"
echo "Starting hey, mark! on macOS..."
echo "========================================"

npm run tauri dev

