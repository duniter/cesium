#!/bin/bash

# Load global variables
. "$(dirname $0)/env-global.sh"

# Make sure variables are set
if [[ "_" == "_${ANDROID_SDK_ROOT}" ]]; then
  echo "Please set env variable ANDROID_SDK_ROOT"
  exit 1
fi
if [[ "_" == "_${ANDROID_SDK_TOOLS_ROOT}" ]]; then
  echo "Please set env variable ANDROID_SDK_TOOLS_ROOT"
  exit 1
fi

if [[ ! -d "${ANDROID_SDK_TOOLS_ROOT}/bin" ]]; then
  echo "Installing Android SDK tools... ${ANDROID_SDK_TOOLS_ROOT}"
  test -e "sdk-tools-linux-${ANDROID_SDK_TOOLS_VERSION}.zip" || wget -kL https://dl.google.com/android/repository/sdk-tools-linux-${ANDROID_SDK_TOOLS_VERSION}.zip
  # Get parent folder
  ANDROID_SDK_TOOLS_PARENT=$(dirname $ANDROID_SDK_ROOT)
  test -e "${ANDROID_SDK_TOOLS_PARENT}" || mkdir -p "${ANDROID_SDK_TOOLS_PARENT}"
  test -e "${ANDROID_SDK_TOOLS_ROOT}" || unzip -qq sdk-tools-linux-${ANDROID_SDK_TOOLS_VERSION}.zip -d "${ANDROID_SDK_TOOLS_PARENT}"
  test -e "${ANDROID_SDK_TOOLS_ROOT}" && rm "sdk-tools-linux-${ANDROID_SDK_TOOLS_VERSION}.zip"
fi

export PATH=${ANDROID_SDK_TOOLS_ROOT}/bin:$PATH

mkdir -p ${ANDROID_SDK_ROOT}/licenses
echo 8933bad161af4178b1185d1a37fbf41ea5269c55 > ${ANDROID_SDK_ROOT}/licenses/android-sdk-license
echo 601085b94cd77f0b54ff86406957099ebe79c4d6 > ${ANDROID_SDK_ROOT}/licenses/android-googletv-license
echo 33b6a2b64607f11b759f320ef9dff4ae5c47d97a > ${ANDROID_SDK_ROOT}/licenses/google-gdk-license
yes | sdkmanager --licenses

mkdir -p ~/.android
touch ~/.android/repositories.cfg

echo y | sdkmanager "platform-tools" "--sdk_root=${ANDROID_SDK_ROOT}" | tee sdkmanager.log
echo y | sdkmanager "extras;android;m2repository" "--sdk_root=${ANDROID_SDK_ROOT}" | tee -a  sdkmanager.log
echo y | sdkmanager "extras;google;m2repository" "--sdk_root=${ANDROID_SDK_ROOT}" | tee -a sdkmanager.log

# Install build tools
echo y | sdkmanager "build-tools;23.0.2" --sdk_root=${ANDROID_SDK_ROOT} | tee -a sdkmanager.log
echo y | sdkmanager "build-tools;23.0.3" --sdk_root=${ANDROID_SDK_ROOT} | tee -a sdkmanager.log
echo y | sdkmanager "build-tools;25.0.2" --sdk_root=${ANDROID_SDK_ROOT}  | tee -a sdkmanager.log
echo y | sdkmanager "build-tools;27.0.3" --sdk_root=${ANDROID_SDK_ROOT}  | tee -a sdkmanager.log
echo y | sdkmanager "build-tools;28.0.3" --sdk_root=${ANDROID_SDK_ROOT}  | tee -a sdkmanager.log
echo y | sdkmanager "build-tools;29.0.2" --sdk_root=${ANDROID_SDK_ROOT}  | tee -a sdkmanager.log

# Install platforms
echo y | sdkmanager "platforms;android-16" --sdk_root=${ANDROID_SDK_ROOT} | tee -a sdkmanager.log
echo y | sdkmanager "platforms;android-21" --sdk_root=${ANDROID_SDK_ROOT} | tee -a sdkmanager.log
echo y | sdkmanager "platforms;android-23" --sdk_root=${ANDROID_SDK_ROOT} | tee -a sdkmanager.log
echo y | sdkmanager "platforms;android-24" --sdk_root=${ANDROID_SDK_ROOT} | tee -a sdkmanager.log
echo y | sdkmanager "platforms;android-25" --sdk_root=${ANDROID_SDK_ROOT} | tee -a sdkmanager.log
echo y | sdkmanager "platforms;android-27" --sdk_root=${ANDROID_SDK_ROOT} | tee -a sdkmanager.log
echo y | sdkmanager "platforms;android-28" --sdk_root=${ANDROID_SDK_ROOT} | tee -a sdkmanager.log
echo y | sdkmanager "platforms;android-29" --sdk_root=${ANDROID_SDK_ROOT} | tee -a sdkmanager.log
