#!/bin/bash

. ./env-global.sh

test -e "${ANDROID_SDK_ROOT}" || mkdir -p "${ANDROID_SDK_ROOT}"

if [[ ! -d "${ANDROID_SDK_TOOLS_ROOT}/bin" ]]; then
  echo "Installing Android SDK tools..."
  test -e "sdk-tools-linux-${ANDROID_SDK_TOOLS_VERSION}.zip" || wget -kL https://dl.google.com/android/repository/sdk-tools-linux-${ANDROID_SDK_TOOLS_VERSION}.zip
  test -e "${ANDROID_SDK_TOOLS_ROOT}" || unzip -qq sdk-tools-linux-${ANDROID_SDK_TOOLS_VERSION}.zip -d "${ANDROID_SDK_TOOLS}"
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

echo y | sdkmanager "platform-tools" --sdk_root=${ANDROID_SDK_ROOT} | tee sdkmanager.log

echo y | sdkmanager "extras;android;m2repository" --sdk_root=${ANDROID_SDK_ROOT} | tee -a  sdkmanager.log
echo y | sdkmanager "extras;google;m2repository" --sdk_root=${ANDROID_SDK_ROOT} | tee -a sdkmanager.log

echo y | sdkmanager "build-tools;23.0.2" --sdk_root=${ANDROID_SDK_ROOT} | tee -a sdkmanager.log
echo y | sdkmanager "build-tools;23.0.3" --sdk_root=${ANDROID_SDK_ROOT} | tee -a sdkmanager.log
echo y | sdkmanager "build-tools;25.0.2" --sdk_root=${ANDROID_SDK_ROOT}  | tee -a sdkmanager.log
echo y | sdkmanager "build-tools;27.0.3" --sdk_root=${ANDROID_SDK_ROOT}  | tee -a sdkmanager.log
echo y | sdkmanager "build-tools;28.0.3" --sdk_root=${ANDROID_SDK_ROOT}  | tee -a sdkmanager.log
echo y | sdkmanager "build-tools;29.0.2" --sdk_root=${ANDROID_SDK_ROOT}  | tee -a sdkmanager.log

echo y | sdkmanager "platforms;android-16" --sdk_root=${ANDROID_SDK_ROOT} | tee -a sdkmanager.log
echo y | sdkmanager "platforms;android-21" --sdk_root=${ANDROID_SDK_ROOT} | tee -a sdkmanager.log
echo y | sdkmanager "platforms;android-23" --sdk_root=${ANDROID_SDK_ROOT} | tee -a sdkmanager.log
echo y | sdkmanager "platforms;android-24" --sdk_root=${ANDROID_SDK_ROOT} | tee -a sdkmanager.log
echo y | sdkmanager "platforms;android-25" --sdk_root=${ANDROID_SDK_ROOT} | tee -a sdkmanager.log
echo y | sdkmanager "platforms;android-27" --sdk_root=${ANDROID_SDK_ROOT} | tee -a sdkmanager.log
echo y | sdkmanager "platforms;android-28" --sdk_root=${ANDROID_SDK_ROOT} | tee -a sdkmanager.log
echo y | sdkmanager "platforms;android-29" --sdk_root=${ANDROID_SDK_ROOT} | tee -a sdkmanager.log
