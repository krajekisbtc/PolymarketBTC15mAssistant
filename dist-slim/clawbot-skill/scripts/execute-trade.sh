#!/bin/bash
# Execute trade - run from project root
# Usage: ./execute-trade.sh UP [--yes]
# Usage: ./execute-trade.sh DOWN [--yes]
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"
SIDE="${1:-}"
SKIP="${2:-}"
if [ "$SIDE" = "UP" ] || [ "$SIDE" = "DOWN" ]; then
  if [ "$SKIP" = "--yes" ] || [ "$SKIP" = "-y" ]; then
    npm run trade -- --execute "$SIDE" --yes
  else
    npm run trade -- --execute "$SIDE"
  fi
else
  echo "Usage: execute-trade.sh UP|DOWN [--yes]"
  exit 1
fi
