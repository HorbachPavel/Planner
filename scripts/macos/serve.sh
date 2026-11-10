#!/bin/bash
# Long-running FocusFlow server. launchd keeps this process alive.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"

exec /usr/local/bin/node "$ROOT/node_modules/next/dist/bin/next" start -H 127.0.0.1 -p 3000
