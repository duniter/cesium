#!/bin/bash -e

# Load global variables
. "$(dirname $0)/env-global.sh"

# Make sure variables are set
if [[ "_" == "_${ANDROID_SDK_ROOT}" ]]; then
  echo "Please set env variable ANDROID_SDK_ROOT"
  exit 1
fi
if [[ "_" == "_${ANDROID_SDK_CLI_ROOT}" ]]; then
  echo "Please set env variable ANDROID_SDK_CLI_ROOT"
  exit 1
fi

if [[ ! -d "${ANDROID_SDK_CLI_ROOT}/bin" ]]; then
  echo "-------------------------------------------"
  echo "Installing Android SDK CLI... ${ANDROID_SDK_CLI_ROOT}"
  mkdir -vp "${ANDROID_SDK_CLI_ROOT}"
  ANDROID_SDK_CLI_FILE="commandlinetools-linux-${ANDROID_SDK_CLI_VERSION}_latest.zip"
  test -e "${ANDROID_SDK_CLI_FILE}" || wget -kL https://dl.google.com/android/repository/${ANDROID_SDK_CLI_FILE}
  test -e "${ANDROID_SDK_CLI_ROOT}" || sudo mkdir -p "${ANDROID_SDK_CLI_ROOT}"
  test -e "/tmp/cmdline-tools" && sudo rm -rf /tmp/cmdline-tools
  test -e "${ANDROID_SDK_CLI_ROOT}" && sudo unzip -qq ${ANDROID_SDK_CLI_FILE} -d /tmp
  test -e "/tmp/cmdline-tools" && sudo mv /tmp/cmdline-tools/* "${ANDROID_SDK_CLI_ROOT}"
  test -e "${ANDROID_SDK_CLI_FILE}" && sudo rm "${ANDROID_SDK_CLI_FILE}"
fi

if [[ ! -d "${ANDROID_SDK_CLI_ROOT}/bin" ]]; then
  echo "Failed to install Android SDK CLI. If you are not root, try with \`sudo -E ./install-android-sdk-tools.sh\`"
  exit 1
fi

mkdir -p ${ANDROID_SDK_ROOT}/licenses
echo 8933bad161af4178b1185d1a37fbf41ea5269c55 > ${ANDROID_SDK_ROOT}/licenses/android-sdk-license
echo 601085b94cd77f0b54ff86406957099ebe79c4d6 > ${ANDROID_SDK_ROOT}/licenses/android-googletv-license
echo 33b6a2b64607f11b759f320ef9dff4ae5c47d97a > ${ANDROID_SDK_ROOT}/licenses/google-gdk-license
yes | sdkmanager --licenses "--sdk_root=${ANDROID_SDK_ROOT}"

mkdir -p ~/.android
touch ~/.android/repositories.cfg

echo y | sdkmanager "platform-tools" "--sdk_root=${ANDROID_SDK_ROOT}" | tee sdkmanager.log
echo y | sdkmanager "extras;android;m2repository" "--sdk_root=${ANDROID_SDK_ROOT}" | tee -a sdkmanager.log
echo y | sdkmanager "extras;google;m2repository" "--sdk_root=${ANDROID_SDK_ROOT}" | tee -a sdkmanager.log
echo y | sdkmanager "cmdline-tools;latest" "--sdk_root=${ANDROID_SDK_ROOT}" | tee sdkmanager.log

# Install build tools
echo ""
echo "-------------------------------------------"
echo "--- Installing Android build-tools ${ANDROID_SDK_VERSION}..."
echo y | sdkmanager "build-tools;${ANDROID_SDK_VERSION}" --sdk_root=${ANDROID_SDK_ROOT}  | tee -a sdkmanager.log
[[ $? -ne 0 ]] && exit 1

# Install platforms
TARGET_VERSIONS="22 23 24 25 26 27 28 29 30 31 32 33"
for TARGET_VERSION in $TARGET_VERSIONS
do
  echo "-------------------------------------------"
  echo "--- Installing Android target ${TARGET_VERSION}..."
  echo y | sdkmanager "platforms;android-${TARGET_VERSION}" --sdk_root=${ANDROID_SDK_ROOT} | tee -a sdkmanager.log
  [[ $? -ne 0 ]] && exit 1
done

# Install NDK
echo "-------------------------------------------"
echo "--- Installing Android NDK..."
echo y | sdkmanager "ndk;22.0.7026061" --sdk_root=${ANDROID_SDK_ROOT} | tee -a sdkmanager.log
#echo y | sdkmanager "ndk;25.2.9519653" --sdk_root=${ANDROID_SDK_ROOT} | tee -a sdkmanager.log
echo y | sdkmanager "ndk;${ANDROID_NDK_VERSION}" --sdk_root=${ANDROID_SDK_ROOT} | tee -a sdkmanager.log

echo "--- Installing Android [OK]"
