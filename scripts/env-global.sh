#!/bin/sh

# Get to the root project
SCRIPT_DIR=$(dirname "$(readlink "$BASH_SOURCE" || echo "$BASH_SOURCE")")
PROJECT_DIR=$(cd "${SCRIPT_DIR}/.." && pwd -P)
export PROJECT_DIR

echo "Preparing project environment..."
echo " - using Project dir: $PROJECT_DIR"

if ! test -f "${PROJECT_DIR}/package.json"; then
  echo "ERROR: Invalid project dir: file 'package.json' not found in ${PROJECT_DIR}"
  echo "       -> Make sure to run the script inside his directory, or export env variable 'PROJECT_DIR'"
  #exit 1
fi;


PROJECT_NAME="cesium"
REPO="duniter/cesium"
REPO_API_URL="https://api.github.com/repos/${REPO}"
REPO_PUBLIC_URL="https://github.com/${REPO}"

NODEJS_VERSION=12
#NODE_OPTIONS=--max-old-space-size=4096

ANDROID_NDK_VERSION=19.2.5345600
ANDROID_SDK_VERSION=21.1.1
ANDROID_SDK_CLI_VERSION=6858069
ANDROID_SDK_ROOT="${HOME}/Android/Sdk"
ANDROID_ALTERNATIVE_SDK_ROOT=/usr/lib/android-sdk
ANDROID_SDK_CLI_ROOT=${ANDROID_SDK_ROOT}/cli
ANDROID_OUTPUT_APK=${PROJECT_DIR}/platforms/android/app/build/outputs/apk
ANDROID_OUTPUT_APK_DEBUG=${ANDROID_OUTPUT_APK}/debug
ANDROID_OUTPUT_APK_RELEASE=${ANDROID_OUTPUT_APK}/release

DIST_WEB=${PROJECT_DIR}/dist/web/build
DIST_ANDROID=${PROJECT_DIR}/dist/android

# Addons Mozilla Web extension ID
WEB_EXT_ID="{6f9922f7-a054-4609-94ce-d269993246a5}"

# /!\ WARN can be define in your <project>/.local/env.sh file
#JAVA_HOME=

GRADLE_VERSION=6.5.1
GRADLE_HOME=${HOME}/.gradle/${GRADLE_VERSION}
CORDOVA_ANDROID_GRADLE_DISTRIBUTION_URL=https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-all.zip
GRADLE_OPTS=-Dorg.gradle.jvmargs=-Xmx512m

# Override with a local file, if any
if test -f "${PROJECT_DIR}/.local/env.sh"; then
  echo "Loading environment variables from: '.local/env.sh'"
  . ${PROJECT_DIR}/.local/env.sh
else
  echo "No file '${PROJECT_DIR}/.local/env.sh' found. Will use defaults"
fi

# Checking Java installed
if test -z "${JAVA_HOME}"; then
  JAVA_CMD=`which java`
  if test -z "${JAVA_CMD}"; then
    echo "ERROR: No Java installed. Please install java, or set env variable JAVA_HOME "
    #exit 1
  fi

  # Check the Java version
  JAVA_VERSION=$(java -version 2>&1 | egrep "(java|openjdk) version" | awk '{print $3}' | tr -d \")
  if test $? -ne 0 || test -z "${JAVA_VERSION}"; then
    echo "No Java JRE 1.8 found in machine. This is required for Android artifacts."
  else
    JAVA_MAJOR_VERSION=$(echo ${JAVA_VERSION} | awk '{split($0, array, ".")} END{print array[1]}')
    JAVA_MINOR_VERSION=$(echo ${JAVA_VERSION} | awk '{split($0, array, ".")} END{print array[2]}')
    if ! test "${JAVA_MAJOR_VERSION}" == "1" || ! test "${JAVA_MINOR_VERSION}" == "8"; then
      echo "ERROR: Require a Java JRE in version 1.8, but found ${JAVA_VERSION}. You can override your default JAVA_HOME in '.local/env.sh'."
    fi
  fi
fi

# Check Android SDK root path
if test -z "${ANDROID_SDK_ROOT}" || ! test -d "${ANDROID_SDK_ROOT}"; then
  if test -d "${ANDROID_ALTERNATIVE_SDK_ROOT}"; then
    export ANDROID_SDK_ROOT="${ANDROID_ALTERNATIVE_SDK_ROOT}"
  else
    echo "ERROR: Please set env variable ANDROID_SDK_ROOT to an existing directory"
  fi
fi

# Add Java, Android SDK tools to path
PATH=${ANDROID_SDK_CLI_ROOT}/bin:${GRADLE_HOME}/bin:${JAVA_HOME}/bin$:$PATH

# Export useful variables
export PATH \
  PROJECT_DIR \
  JAVA_HOME \
  ANDROID_SDK_ROOT \
  ANDROID_SDK_CLI_ROOT \
  CORDOVA_ANDROID_GRADLE_DISTRIBUTION_URL


# Node JS
export NVM_DIR="$HOME/.nvm"
if test -d "${NVM_DIR}"; then

    # Load NVM
    . "${NVM_DIR}/nvm.sh"

    # Switch to expected version
    nvm use ${NODEJS_VERSION}

    # Or install it
    if test $? -ne 0; then
        nvm install ${NODEJS_VERSION}
    fi
else
    echo "nvm (Node version manager) not found (directory ${NVM_DIR} not found). Please install, and retry"
fi

# Install global dependencies
YARN_PATH=`which yarn`
IONIC_PATH=`which ionic`
CORDOVA_PATH=`which cordova`
CORDOVA_RES_PATH=`which cordova-res`
NATIVE_RUN_PATH=`which native-run`
WEB_EXT_PATH=`which web-ext`
if test -z "${YARN_PATH}" || test -z "${IONIC_PATH}" || test -z "${CORDOVA_PATH}" || test -z "${CORDOVA_RES_PATH}" || test -z "${NATIVE_RUN_PATH}" || test -z "${WEB_EXT_PATH}"; then
  echo "Installing global dependencies..."
  npm install -g yarn cordova cordova-res @ionic/cli web-ext native-run
  if ! test $? == 0; then
    echo "ERROR: Unable to install global dependencies"
    #exit 1
  fi

  # Make sure Ionic use yarn
  ionic config set -g yarn true
fi

# Install project dependencies
if ! test -d "${PROJECT_DIR}/node_modules"; then
    echo "Installing project dependencies..."
    cd "${PROJECT_DIR}"
    yarn install
fi

# Install project submodules
if ! test -d "${PROJECT_DIR}/platforms/android" || ! test -d "${PROJECT_DIR}/dist/desktop"; then
  #echo "Installing project submodules..."
  #cd "${PROJECT_DIR}"
  #git submodule init && git submodule sync && git submodule update --remote --merge
  if ! test $? == 0; then
    echo "ERROR: Unable to sync git submodule. Will not be able to build android and desktop artifacts!"
    #exit 1
  fi
fi


export PATH \
  PROJECT_DIR PROJECT_NAME \
  REPO REPO_API_URL REPO_PUBLIC_URL \
  NODEJS_VERSION \
  ANDROID_NDK_VERSION ANDROID_SDK_VERSION ANDROID_SDK_CLI_VERSION ANDROID_SDK_ROOT ANDROID_ALTERNATIVE_SDK_ROOT \
  ANDROID_SDK_CLI_ROOT ANDROID_OUTPUT_APK ANDROID_OUTPUT_APK_DEBUG ANDROID_OUTPUT_APK_RELEASE \
  GRADLE_HOME GRADLE_OPTS \
  DIST_WEB DIST_ANDROID \
  WEB_EXT_ID

echo "Project environment is ready!"
