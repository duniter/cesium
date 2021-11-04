#!/bin/bash

# Get to the root project
if [[ "_" == "_${PROJECT_DIR}" ]]; then
  SCRIPT_DIR=$(dirname $0)
  PROJECT_DIR=$(cd ${SCRIPT_DIR}/.. && pwd)
  export PROJECT_DIR
fi;

# Default env variables (can be override in '.local/env.sh' file)
KEYSTORE_FILE=${PROJECT_DIR}/.local/Cesium.keystore
KEY_ALIAS=Cesium
KEY_PWD=

# Preparing Android environment
source ${PROJECT_DIR}/scripts/env-android.sh
[[ $? -ne 0 ]] && exit 1

APK_UNSIGNED_FILE=${ANDROID_OUTPUT_APK_RELEASE}/app-release-unsigned.apk

cd ${PROJECT_DIR}

# Run the build
echo "Running cordova build..."
ionic cordova build android --warning-mode=none --color --prod --release
[[ $? -ne 0 ]] && exit 1


if [[ ! -f "${APK_UNSIGNED_FILE}" ]]; then
  echo "APK file not found at: ${APK_UNSIGNED_FILE}"
  exit 1
fi

# Sign APK file
. ./script/release-android-sign.sh
[[ $? -ne 0 ]] && exit 1
