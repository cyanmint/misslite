#!/usr/bin/env bash
# SPDX-License-Identifier: CC0-1.0
# This file is dedicated to the public domain under CC0-1.0.
#
# Misslite frontend build script
# Clones misskey, applies patches to add select-server feature and standalone
# build support, then builds only the frontend.
#
# Usage: ./build.sh [misskey-ref]
#   misskey-ref: git ref to clone (default: develop)
#
# Output: webroot/ directory with built frontend

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MISSKEY_REF="${1:-develop}"
BUILD_DIR="${SCRIPT_DIR}/misskey-build"
WEBROOT_DIR="${SCRIPT_DIR}/webroot"

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

# Step 2: Apply patch 1 - add select server feature
echo "[build] Applying patch 1: select server feature..."
git apply --whitespace=fix "${SCRIPT_DIR}/patches/0001-add-select-server.patch"

# Step 3: Apply patch 2 - standalone build support
echo "[build] Applying patch 2: standalone build support..."
git apply --whitespace=fix "${SCRIPT_DIR}/patches/0002-standalone-build.patch"

# Step 4: Install dependencies
echo "[build] Installing dependencies..."
pnpm install --frozen-lockfile

# Step 5: Build i18n locales
echo "[build] Building i18n..."
pnpm -F i18n build

# Step 6: Build frontend-builder (needed for vite plugins)
echo "[build] Building frontend-builder..."
pnpm -F frontend-builder build

# Step 7: Build frontend only
echo "[build] Building frontend..."
pnpm -F frontend build

# Step 8: Copy built assets
echo "[build] Build complete!"
echo "[build] Output: ${BUILD_DIR}/webroot/"

# Optionally copy to repo's webroot
if [ -n "${COPY_WEBROOT:-}" ]; then
  echo "[build] Copying webroot to ${WEBROOT_DIR}..."
  rm -rf "${WEBROOT_DIR}"
  cp -r "${BUILD_DIR}/webroot" "${WEBROOT_DIR}"
  echo "[build] Done!"
fi
