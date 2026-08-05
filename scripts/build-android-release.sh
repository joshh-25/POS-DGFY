#!/usr/bin/env bash

# Builds a release APK of the iMin Android wrapper against the requested
# product flavor (dev/staging/beta/prod) and copies it into
# releases/android/ with a checksum.
#
# Usage:
#   bash scripts/build-android-release.sh <dev|staging|beta|prod> [--clean] [--pos-origin URL]
#
# All four release build types currently reuse the debug signing config
# (see android/imin-wrapper/app/build.gradle.kts), so the resulting APK is
# already signed and installable without a separate keystore.
#
# --pos-origin overrides the flavor's default POS origin at build time
# (forwarded as -Pdgfy.<flavor>.posOrigin=<URL> to Gradle) -- useful when a
# flavor's DNS convention (pos.<env>.dgfy.ph) doesn't match a real
# environment, without editing build.gradle.kts.

set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$PROJECT_ROOT/android/imin-wrapper"
OUTPUT_DIR="$PROJECT_ROOT/releases/android"

usage() {
    echo "Usage: bash scripts/build-android-release.sh <dev|staging|beta|prod> [--clean] [--pos-origin URL]" >&2
}

FLAVOR="${1:-}"
case "$FLAVOR" in
    dev|staging|beta|prod)
        shift
        ;;
    ""|-h|--help)
        usage
        exit 1
        ;;
    *)
        echo "Unknown flavor: $FLAVOR" >&2
        usage
        exit 1
        ;;
esac

CLEAN="0"
POS_ORIGIN=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --clean)
            CLEAN="1"
            shift
            ;;
        --pos-origin)
            POS_ORIGIN="${2:-}"
            if [[ -z "$POS_ORIGIN" ]]; then
                echo "--pos-origin requires a URL argument" >&2
                exit 1
            fi
            shift 2
            ;;
        *)
            echo "Unknown argument: $1" >&2
            usage
            exit 1
            ;;
    esac
done

if [[ ! -d "$ANDROID_DIR" ]]; then
    echo "Android project not found at $ANDROID_DIR" >&2
    exit 1
fi

# Capitalized flavor for the Gradle task name (assembleDevRelease, etc).
FLAVOR_TASK="$(tr '[:lower:]' '[:upper:]' <<< "${FLAVOR:0:1}")${FLAVOR:1}"

APK_SOURCE="$ANDROID_DIR/app/build/outputs/apk/$FLAVOR/release/app-$FLAVOR-release.apk"
METADATA_SOURCE="$ANDROID_DIR/app/build/outputs/apk/$FLAVOR/release/output-metadata.json"

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

GRADLE_ARGS=("assemble${FLAVOR_TASK}Release")
if [[ -n "$POS_ORIGIN" ]]; then
    GRADLE_ARGS+=("-Pdgfy.$FLAVOR.posOrigin=$POS_ORIGIN")
fi

echo "==> Building $FLAVOR release APK (${GRADLE_ARGS[0]})"
"$GRADLEW" "${GRADLE_ARGS[@]}"

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
APK_DEST="$OUTPUT_DIR/dgfy-imin-pos-${FLAVOR}-${VERSION_NAME}-${TIMESTAMP}.apk"
cp "$APK_SOURCE" "$APK_DEST"

if command -v shasum >/dev/null 2>&1; then
    (cd "$OUTPUT_DIR" && shasum -a 256 "$(basename "$APK_DEST")" > "$(basename "$APK_DEST").sha256")
elif command -v sha256sum >/dev/null 2>&1; then
    (cd "$OUTPUT_DIR" && sha256sum "$(basename "$APK_DEST")" > "$(basename "$APK_DEST").sha256")
fi

APK_SIZE="$(du -h "$APK_DEST" | cut -f1)"

echo ""
echo "==> $FLAVOR release APK ready"
echo "    Application ID : $APPLICATION_ID"
echo "    Version         : $VERSION_NAME ($VERSION_CODE)"
echo "    Size            : $APK_SIZE"
echo "    Path            : $APK_DEST"
[[ -f "$APK_DEST.sha256" ]] && echo "    Checksum        : $APK_DEST.sha256"
