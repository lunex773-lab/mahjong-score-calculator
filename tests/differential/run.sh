#!/usr/bin/env bash
# 差分テスト: 本アプリの採点エンジンと Python「mahjong」ライブラリ（独立実装）をランダム手牌で照合する。
# 事前に `pip install mahjong==1.2.1` が必要。使い方: tests/differential/run.sh [seed] [件数]
set -euo pipefail
cd "$(dirname "$0")/../.."
out="$(mktemp -d)"
npx esbuild tests/differential/generate.ts --bundle --platform=node --outfile="$out/generate.js" --log-level=warning
node "$out/generate.js" "${1:-1}" "${2:-5000}" 2>/dev/null | python3 tests/differential/compare.py
