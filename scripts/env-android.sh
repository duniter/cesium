#!/bin/sh

# Get to the root project
SCRIPT_DIR=$(dirname "$(readlink "$BASH_SOURCE" || echo "$BASH_SOURCE")")
PROJECT_DIR=$(cd "${SCRIPT_DIR}/.." && pwd -P)
export PROJECT_DIR


# Preparing environment
. "${PROJECT_DIR}/scripts/env-global.sh"

if test -z "${CORDOVA_ANDROID_GRADLE_DISTRIBUTION_URL}"; then
  echo "ERROR: Missing Gradle distribution URL - please export env variable 'CORDOVA_ANDROID_GRADLE_DISTRIBUTION_URL'"
fi

echo "Preparing Android environment:"
echo "        Root: ${PROJECT_DIR}"
echo "      NodeJS: version ${NODE_VERSION} with options: ${NODE_OPTIONS}"
echo " Android SDK: ${ANDROID_SDK_ROOT} with CLI: ${ANDROID_SDK_CLI_ROOT}"
echo "      Gradle: ${GRADLE_HOME} with options: ${GRADLE_OPTS}"
echo "        Java: ${JAVA_HOME}"

# Make sure javac exists
JAVAC_PATH=$(which javac)
if test -z "${JAVAC_PATH}"; then
  echo "ERROR: 'javac' executable not found in PATH. Make sure you have installed a complete Java JDK, and not only a JRE."
  #exit 1
fi

# Prepare Android SDK tools
if ! test -d "${ANDROID_SDK_ROOT}/build-tools/${ANDROID_SDK_VERSION}" || ! test -d "${ANDROID_SDK_CLI_ROOT}/tools/bin"; then
  . ${PROJECT_DIR}/scripts/install-android-sdk.sh
  if test $? -ne 0; then
    echo "ERROR: Unable to install Android SDK Tools & CLI"
  fi
fi

# Install Gradle
if test -z "$(which gradle)" && ! test -d "${GRADLE_HOME}"; then
  cd "${PROJECT_DIR}/scripts"
  echo "Installing gradle...  ${GRADLE_HOME}"
  test -e "gradle-${GRADLE_VERSION}-all.zip" || wget -kL ${CORDOVA_ANDROID_GRADLE_DISTRIBUTION_URL}
  GRADLE_PARENT=$(dirname $GRADLE_HOME)
  test -e "${GRADLE_PARENT}" || mkdir -p ${GRADLE_PARENT}
  test -e "${GRADLE_PARENT}/gradle-${GRADLE_VERSION}" || unzip -qq gradle-${GRADLE_VERSION}-all.zip -d "${GRADLE_PARENT}"
  if test $? -eq 0; then
    test -e "${GRADLE_HOME}" || mv "${GRADLE_PARENT}/gradle-${GRADLE_VERSION}" "${GRADLE_HOME}"
    if test $? -eq 0; then
      test -e "${GRADLE_PARENT}/gradle-${GRADLE_VERSION}" || rm "${GRADLE_PARENT}/gradle-${GRADLE_VERSION}"
    fi
  fi
  if test $? -ne 0; then
    echo "ERROR: Unable to install Gradle"
  fi
fi

# Prepare Android platform
if ! test -d "${PROJECT_DIR}/platforms/android"; then
  echo "Adding Cordova Android platform..."
  cd "${PROJECT_DIR}"
  ionic cordova prepare android --color --verbose
  if test $? -ne 0; then
    echo "ERROR: Cannot install Android platform (using cordova)"
  fi
fi

# Copy local files
ANDROID_OVERWRITE_DIR=${PROJECT_DIR}/.local/android
if test -d "${ANDROID_OVERWRITE_DIR}"; then
  echo "Copying files from directory '${ANDROID_OVERWRITE_DIR}' into '${PROJECT_DIR}/platforms/android'..."
  cp -rf ${ANDROID_OVERWRITE_DIR}/* ${PROJECT_DIR}/platforms/android
  if test $? -ne 0; then
    echo "ERROR: Cannot copy local files '${ANDROID_OVERWRITE_DIR}/*'"
  fi
else
  echo "No directory '${ANDROID_OVERWRITE_DIR}' not found. Please create it, with a file 'release-signing.properties' for release signing"
fi

echo
echo "Check Requirements"
cordova requirements android --verbose
if test $? -ne 0; then
  echo "ERROR: Check Cordova requirements failed"
fi

export PATH=${GRADLE_HOME}/bin:${PATH}

echo "Android environment is ready!"
