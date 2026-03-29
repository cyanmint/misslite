#!/usr/bin/env bash
# SPDX-License-Identifier: CC0-1.0
# This file is dedicated to the public domain under CC0-1.0.
#
# Misslite frontend build script
# Clones misskey, applies patches, builds only the frontend.
#
# Usage: ./build.sh [misskey-ref]
#   misskey-ref: git ref to clone (default: develop)
#
# Output: misskey-build/webroot/ directory with built frontend

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MISSKEY_REF="${1:-develop}"
BUILD_DIR="${SCRIPT_DIR}/misskey-build"

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

# Step 2: Apply patches
echo "[build] Applying patch 1: select server feature..."
git apply --whitespace=fix "${SCRIPT_DIR}/patches/0001-add-select-server.patch"

echo "[build] Applying patch 2: standalone build support..."
git apply --whitespace=fix "${SCRIPT_DIR}/patches/0002-standalone-build.patch"

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

