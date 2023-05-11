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

APK_SIGNED_FILE=${ANDROID_OUTPUT_APK_RELEASE}/${ANDROID_OUTPUT_APK_PREFIX}-release-signed.apk
APK_UNSIGNED_FILE=${ANDROID_OUTPUT_APK_RELEASE}/${ANDROID_OUTPUT_APK_PREFIX}-release-unsigned.apk

echo "--- Cleaning previous Android APK ..."
rm -f ${ANDROID_OUTPUT_APK_RELEASE}/*.apk*
echo "--- Cleaning previous Android APK [OK]"
echo ""

# Run the build
echo "--- Building Android APK..."
echo ""
yarn run build:android
[[ $? -ne 0 ]] && exit 1

echo "--- Building Android APK [OK]"
echo ""

# Sign APK file
cd ${PROJECT_DIR}/scripts
./release-android-sign.sh
[[ $? -ne 0 ]] && exit 1

cd ${PROJECT_DIR}
