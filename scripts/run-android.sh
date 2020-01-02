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
echo "Building Android application..."
ionic cordova build android --warning-mode=none --color

echo "Running Android application..."
native-run android --app ${ANDROID_OUTPUT_APK_DEBUG}/android-debug.apk $*
