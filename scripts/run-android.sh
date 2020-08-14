#!/bin/bash

# Get to the root project
if [[ "_" == "_${PROJECT_DIR}" ]]; then
  SCRIPT_DIR=$(dirname $0)
  PROJECT_DIR=$(cd ${SCRIPT_DIR}/.. && pwd)
  export PROJECT_DIR
fi;

# Preparing Android environment
. ${PROJECT_DIR}/scripts/env-android.sh
[[ $? -ne 0 ]] && exit 1

cd ${PROJECT_DIR}

# Run the build
echo "Building Android application..."
ionic cordova build android --warning-mode=none --color $*
[[ $? -ne 0 ]] && exit 1

echo "Running Android application..."
if [[ "$1" == "--release" ]]; then
  if [[ -f ${ANDROID_OUTPUT_APK_RELEASE}/app-release.apk ]]; then
    native-run android --app ${ANDROID_OUTPUT_APK_RELEASE}/app-release-unsigned.apk
  elif [[ -f ${ANDROID_OUTPUT_APK_RELEASE}/app-release.apk ]]; then
    native-run android --app ${ANDROID_OUTPUT_APK_RELEASE}/app-release-unsigned.apk
  fi
else
  native-run android --app ${ANDROID_OUTPUT_APK_DEBUG}/app-debug.apk
fi

