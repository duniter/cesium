#!/bin/bash

# Get to the root project
if [[ "_" == "_${PROJECT_DIR}" ]]; then
  SCRIPT_DIR=$(dirname $0)
  PROJECT_DIR=$(cd ${SCRIPT_DIR}/.. && pwd)
  export PROJECT_DIR
fi;

# Default env (can be override in file <PROJECT>/.local/env.sh)
KEYSTORE_FILE=${PROJECT_DIR}/.local/android/Cesium.keystore
KEY_ALIAS=Cesium
KEYSTORE_PWD=
APK_RELEASE_DIR=${PROJECT_DIR}/platforms/android/build/outputs/apk/release
APK_UNSIGNED_FILE=${APK_RELEASE_DIR}/android-release-unsigned.apk
APK_SIGNED_FILE=${APK_RELEASE_DIR}/android-release-signed.apk


# Preparing Android environment
. ${PROJECT_DIR}/scripts/env-android.sh
if [[ $? -ne 0 ]]; then
  exit 1
fi

cd ${PROJECT_DIR}

# Sign files
echo "Signing APK file..."
if [[ ! -f "${APK_UNSIGNED_FILE}" ]]; then
  echo "APK file not found: ${APK_UNSIGNED_FILE}"
  exit 1
fi
if [[ ! -f "${KEYSTORE_FILE}" ]]; then
  echo "Keystore file not found: ${KEYSTORE_FILE}"
  exit 1
fi

# Remove previous version
if [[ -f "${APK_SIGNED_FILE}" ]]; then
  echo "Delete previous signed APK file: ${APK_SIGNED_FILE}"
  rm -f ${APK_SIGNED_FILE}
fi

echo "Executing jarsigner..."
jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 -keystore ${KEYSTORE_FILE} ${APK_UNSIGNED_FILE} Cesium
if [[ $? -ne 0 ]]; then
  exit 1
fi
echo "Executing jarsigner [OK]"

BUILD_TOOLS_DIR="${ANDROID_SDK_ROOT}/build-tools/28.*/"
cd ${BUILD_TOOLS_DIR}

echo "Executing zipalign..."
./zipalign -v 4 ${APK_UNSIGNED_FILE} ${APK_SIGNED_FILE}
if [[ $? -ne 0 ]]; then
  exit 1
fi
echo "Executing zipalign [OK]"

echo "Verify APK signature..."
./apksigner verify ${APK_SIGNED_FILE}
if [[ $? -ne 0 ]]; then
  exit 1
fi
echo "Verify APK signature [OK]"

echo "Successfully generated signed APK at: ${APK_SIGNED_FILE}"
