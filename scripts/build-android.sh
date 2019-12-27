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
echo "Cleaning previous android APK files..."
rm -rf ${ANDROID_OUTPUT_APK_DEBUG}/*.apk
rm -rf ${ANDROID_OUTPUT_APK_RELEASE}/*.apk

echo "Running cordova build android..."
ionic cordova build android --warning-mode=none --color $*
#ionic cordova build android --warning-mode=none --color --verbose
