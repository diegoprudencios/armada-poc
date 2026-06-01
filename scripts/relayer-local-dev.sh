#!/usr/bin/env bash
# Local Anvil relayer — requires `npm run chains` + `npm run setup` first.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
set -a
# shellcheck source=/dev/null
source config/local.env
set +a
exec npm run relayer
