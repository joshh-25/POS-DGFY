#!/usr/bin/env bash

# Builds a release APK of the iMin Android wrapper against the beta flavor
# (pos.beta.dgfy.ph) and copies it into releases/android/ with a checksum.
#
# Usage:
#   bash scripts/build-android-beta-release.sh [--clean]
#
# The beta release build type currently reuses the debug signing config
# (see android/imin-wrapper/app/build.gradle.kts), so the resulting APK is
# already signed and installable without a separate keystore.

set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$PROJECT_ROOT/android/imin-wrapper"
OUTPUT_DIR="$PROJECT_ROOT/releases/android"
APK_SOURCE="$ANDROID_DIR/app/build/outputs/apk/beta/release/app-beta-release.apk"
METADATA_SOURCE="$ANDROID_DIR/app/build/outputs/apk/beta/release/output-metadata.json"

CLEAN="0"
for arg in "$@"; do
    case "$arg" in
        --clean)
            CLEAN="1"
            ;;
        *)
            echo "Unknown argument: $arg" >&2
            echo "Usage: bash scripts/build-android-beta-release.sh [--clean]" >&2
            exit 1
            ;;
    esac
done

if [[ ! -d "$ANDROID_DIR" ]]; then
    echo "Android project not found at $ANDROID_DIR" >&2
    exit 1
fi

GRADLEW="$ANDROID_DIR/gradlew"
if [[ "${OS:-}" == "Windows_NT" ]]; then
    GRADLEW="$ANDROID_DIR/gradlew.bat"
fi
chmod +x "$GRADLEW" 2>/dev/null || true

cd "$ANDROID_DIR"

if [[ "$CLEAN" == "1" ]]; then
    echo "==> Cleaning previous build output"
    "$GRADLEW" clean
fi

echo "==> Building beta release APK (assembleBetaRelease)"
"$GRADLEW" assembleBetaRelease

if [[ ! -f "$APK_SOURCE" ]]; then
    echo "Build finished but expected APK was not found at $APK_SOURCE" >&2
    exit 1
fi

VERSION_NAME="unknown"
VERSION_CODE="unknown"
APPLICATION_ID="unknown"
if [[ -f "$METADATA_SOURCE" ]] && command -v node >/dev/null 2>&1; then
    read -r VERSION_NAME VERSION_CODE APPLICATION_ID < <(node -e '
        const meta = require(process.argv[1]);
        const el = meta.elements[0];
        console.log(el.versionName, el.versionCode, meta.applicationId);
    ' "$METADATA_SOURCE")
fi

mkdir -p "$OUTPUT_DIR"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
APK_DEST="$OUTPUT_DIR/dgfy-imin-pos-beta-${VERSION_NAME}-${TIMESTAMP}.apk"
cp "$APK_SOURCE" "$APK_DEST"

if command -v shasum >/dev/null 2>&1; then
    (cd "$OUTPUT_DIR" && shasum -a 256 "$(basename "$APK_DEST")" > "$(basename "$APK_DEST").sha256")
elif command -v sha256sum >/dev/null 2>&1; then
    (cd "$OUTPUT_DIR" && sha256sum "$(basename "$APK_DEST")" > "$(basename "$APK_DEST").sha256")
fi

APK_SIZE="$(du -h "$APK_DEST" | cut -f1)"

echo ""
echo "==> Beta release APK ready"
echo "    Application ID : $APPLICATION_ID"
echo "    Version         : $VERSION_NAME ($VERSION_CODE)"
echo "    Size            : $APK_SIZE"
echo "    Path            : $APK_DEST"
[[ -f "$APK_DEST.sha256" ]] && echo "    Checksum        : $APK_DEST.sha256"
