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

if [[ ! -d "${ANDROID_SDK_CLI_ROOT}/bin" ]]; then
  echo "Failed to find the Android SDK CLI. Please run first:  \`scripts/install-android-sdk-tools.sh\`"
  exit 1
fi

# Run the build
echo "Cleaning previous android APK files..."
rm -f ${ANDROID_OUTPUT_APK_DEBUG}/*.apk
rm -f ${ANDROID_OUTPUT_APK_RELEASE}/*.apk*

echo "Running cordova build android..."
ionic cordova build android --warning-mode=none --color $* -- -- --packageType=apk
#ionic cordova build android --warning-mode=none --color --verbose -- -- --packageType=apk
