#!/usr/bin/env bash
# SPDX-License-Identifier: CC0-1.0
# Misslite frontend build script
# Clones misskey, applies patches, builds only the frontend.
# Usage: ./scripts/build-frontend.sh [misskey-ref]
#   misskey-ref: git ref to clone (default: develop)
# Output: misskey-build/webroot/ directory with built frontend

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
MISSKEY_REF="${1:-develop}"
BUILD_DIR="${REPO_ROOT}/misskey-build"

echo "[build] Starting misslite frontend build"
echo "[build] Misskey ref: ${MISSKEY_REF}"
echo "[build] Build dir: ${BUILD_DIR}"

# Step 1: Clone misskey
if [ -d "${BUILD_DIR}" ]; then
  echo "[build] Removing existing build directory..."
  rm -rf "${BUILD_DIR}"
fi

echo "[build] Cloning misskey..."
git clone --depth=1 --branch "${MISSKEY_REF}" \
  https://github.com/misskey-dev/misskey.git \
  "${BUILD_DIR}"

cd "${BUILD_DIR}"

# Init submodules (needed for fluent-emojis)
echo "[build] Initializing submodules..."
git submodule update --init --depth=1

# Step 2: Apply per-file patches (with fuzz for upstream compatibility)
echo "[build] Applying patches..."
find "${REPO_ROOT}/patches" -name '*.patch' -type f | sort | while read -r patchfile; do
  relpath="${patchfile#${REPO_ROOT}/patches/}"
  echo "[build]   Applying: ${relpath}"
  patch -p1 --fuzz=3 < "${patchfile}"
done

# Step 3: Install and build
echo "[build] Installing dependencies..."
corepack enable
corepack pnpm install

echo "[build] Building frontend dependencies..."
node scripts/build-pre.mjs
corepack pnpm -F i18n build
corepack pnpm -F misskey-js build
corepack pnpm -F misskey-bubble-game build
corepack pnpm -F misskey-reversi build
corepack pnpm -F icons-subsetter build

echo "[build] Building frontend..."
corepack pnpm -F frontend build

# Copy locale JSON files to webroot for runtime locale loading
echo "[build] Copying locale files..."
mkdir -p webroot/locales
cp built/_frontend_dist_/locales/*.json webroot/locales/

echo "[build] Build complete!"
echo "[build] Output: ${BUILD_DIR}/webroot/"
