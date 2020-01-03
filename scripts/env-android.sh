#!/bin/bash

# Get to the root project
if [[ "_" == "_${PROJECT_DIR}" ]]; then
  SCRIPT_DIR=$(dirname $0)
  PROJECT_DIR=$(cd "${SCRIPT_DIR}/.." && pwd)
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
echo " - using Gradle: ${GRADLE_HOME}"
echo " - using Java: ${JAVA_HOME}"
echo " - project dir: ${PROJECT_DIR}"

# Make sure javac exists
JAVAC_PATH=$(which javac)
if [[ "_" == "_${JAVAC_PATH}" ]]; then
  echo "ERROR: 'javac' executable not found in PATH. Make sure you have installed a complete Java JDK, and not only a JRE."
  exit 1
fi

# Prepare Android SDK tools
if [[ ! -d "${ANDROID_SDK_TOOLS_ROOT}" ]]; then
  cd "${PROJECT_DIR}/scripts"
  ./install-android-sdk-tools.sh
  if [[ $? -ne 0 ]]; then
    exit 1
  fi
fi

# Install Gradle
if [[ "_" == "_$(which gradle)" && ! -d "${GRADLE_HOME}" ]]; then
  cd "${PROJECT_DIR}/scripts"
  echo "Installing gradle...  ${GRADLE_HOME}"
  test -e "gradle-${GRADLE_VERSION}-all.zip" || wget -kL ${CORDOVA_ANDROID_GRADLE_DISTRIBUTION_URL}
  GRADLE_PARENT=$(dirname $GRADLE_HOME)
  test -e "${GRADLE_PARENT}" || mkdir -p ${GRADLE_PARENT}
  test -e "${GRADLE_PARENT}/gradle-${GRADLE_VERSION}" || unzip -qq gradle-${GRADLE_VERSION}-all.zip -d "${GRADLE_PARENT}"
  if [[ $? -ne 0 ]]; then
      exit 1
  fi
  test -e "${GRADLE_HOME}" || mv "${GRADLE_PARENT}/gradle-${GRADLE_VERSION}" "${GRADLE_HOME}"
  if [[ $? -ne 0 ]]; then
      exit 1
  fi
  test -e "${GRADLE_PARENT}/gradle-${GRADLE_VERSION}" || rm "${GRADLE_PARENT}/gradle-${GRADLE_VERSION}"
fi


# Prepare Android platform
if [[ ! -d "${PROJECT_DIR}/platforms/android" ]]; then
  echo "Adding Cordova Android platform..."
  cd "${PROJECT_DIR}"
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

