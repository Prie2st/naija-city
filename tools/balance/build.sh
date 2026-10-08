#!/usr/bin/env bash
# Bundles the balance harness into tools/balance/dist (self-contained ESM, so a run keeps the code it was built from).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p dist out
for f in run exp shock; do [ -f "$f.ts" ] && ../../node_modules/.bin/esbuild "$f.ts" --bundle --platform=node --format=esm --outfile="dist/$f.mjs" --log-level=warning; done
echo built
