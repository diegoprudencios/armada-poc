#!/usr/bin/env bash
# Dev relayer against Sepolia deployment manifests (fee quotes + relay API).
# Requires a deployer key: config/secrets.env or DEPLOYER_PRIVATE_KEY in the environment.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
set -a
# shellcheck source=/dev/null
source config/sepolia.env
if [[ -f config/secrets.env ]]; then
  # shellcheck source=/dev/null
  source config/secrets.env
fi
set +a
if [[ -z "${DEPLOYER_PRIVATE_KEY:-}" ]]; then
  echo "DEPLOYER_PRIVATE_KEY is required. Copy config/secrets.env.template to config/secrets.env." >&2
  exit 1
fi
exec npm run relayer
