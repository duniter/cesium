#!/bin/bash

# Get to the root project
if [[ "_" == "_${PROJECT_DIR}" ]]; then
  SCRIPT_DIR=$(dirname $0)
  PROJECT_DIR=$(cd ${SCRIPT_DIR}/.. && pwd)
  export PROJECT_DIR
fi;

# Preparing environment
. ${PROJECT_DIR}/scripts/env-global.sh
if [[ $? -ne 0 ]]; then
  exit 1
fi

if [[ "_" == "_${CORDOVA_ANDROID_GRADLE_DISTRIBUTION_URL}" ]]; then
  echo "Missing Gradle distribution URL - please export env variable 'CORDOVA_ANDROID_GRADLE_DISTRIBUTION_URL'"
  exit 1
fi

echo "Preparing Android environment:"
echo " - using Android SDK: ${ANDROID_SDK_ROOT}"
echo " - using Android SDK tools: ${ANDROID_SDK_TOOLS_ROOT}"
echo " - using Gradle: ${CORDOVA_ANDROID_GRADLE_DISTRIBUTION_URL}"
echo " - using Java: ${JAVA_HOME}"
echo " - project dir: ${PROJECT_DIR}"

cd ${PROJECT_DIR}

# Prepare Android platform
if [[ ! -d "${PROJECT_DIR}/platforms/android" ]]; then
  echo "Adding Cordova Android platform..."
  ionic cordova prepare android --color --verbose
  if [[ $? -ne 0 ]]; then
    exit 1
  fi
fi

# Copy local files
if [[ -d "${PROJECT_DIR}/.local/android" ]]; then
  echo "Copying files from directory '${PROJECT_DIR}/.local/android' into '${PROJECT_DIR}/platforms/android'..."
  cp -rf ${PROJECT_DIR}/.local/android/* ${PROJECT_DIR}/platforms/android
  if [[ $? -ne 0 ]]; then
    exit 1
  fi
else
  echo "No directory '${PROJECT_DIR}/.local/android' found. Please create it, with a file 'release-signing.properties' for release signing"
fi

