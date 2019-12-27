#!/bin/bash

# Get to the root project
if [[ "_" == "_${PROJECT_DIR}" ]]; then
  SCRIPT_DIR=$(dirname $0)
  PROJECT_DIR=$(cd ${SCRIPT_DIR}/.. && pwd)
  export PROJECT_DIR
fi;

# Preparing Android environment
. ${PROJECT_DIR}/scripts/env-android.sh
if [[ $? -ne 0 ]]; then
  exit 1
fi

cd ${PROJECT_DIR}

# Run the build
echo "Running cordova build..."

ionic cordova build android --warning-mode=none --color --prod --release
# TODO: try this :
#ionic cordova build android --warning-mode=none --color --prod --release --optimizejs --minifyjs --minifycss

if [[ $? -ne 0 ]]; then
  exit 1
fi

# Signature
KEYSTORE_FILE=${PROJECT_DIR}/.local/Cesium.keystore
KEY_ALIAS=Cesium
KEY_PWD=
APK_DIR=${PROJECT_DIR}/platforms/android/build/outputs/apk/release
APK_UNSIGNED_FILE=${APK_DIR}/android-release.apk
BUILD_TOOLS_DIR="${ANDROID_SDK_ROOT}/build-tools/28.*/"

if [[ ! -f "${APK_UNSIGNED_FILE}" ]]; then
  echo "APK file not found at: ${APK_UNSIGNED_FILE}"
  exit 1
fi

# Check if signed
cd ${BUILD_TOOLS_DIR}
./apksigner verify ${APK_UNSIGNED_FILE}

# Not signed ? Do it !
if [[ $? -ne 0 ]]; then
  echo "It seems that the APK file ${APK_UNSIGNED_FILE} is not signed !"
  if [[ ! -f "${KEYSTORE_FILE}" ]]; then
    echo "ERROR: Unable to sign: no keystore file found at ${KEYSTORE_FILE} !"
    exit 1
  fi

  echo "Signing APK file ${APK_UNSIGNED_FILE}..."
  APK_SIGNED_FILE=${APK_DIR}/android-release-signed.apk

  jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 -keystore ${KEYSTORE_FILE} ${APK_UNSIGNED_FILE} Cesium

  BUILD_TOOLS_DIR="${ANDROID_SDK_ROOT}/build-tools/28.*/"
  cd ${BUILD_TOOLS_DIR}
  ./zipalign -v 4 ${APK_UNSIGNED_FILE} ${APK_SIGNED_FILE}

  ./apksigner verify ${APK_SIGNED_FILE}
  if [[ $? -ne 0 ]]; then
    echo "Signing failed !"
    exit 1
  fi

  # Do file replacement
  rm ${APK_UNSIGNED_FILE}
  mv ${APK_SIGNED_FILE} ${APK_UNSIGNED_FILE}
fi
