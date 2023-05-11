#!/bin/bash

# Get to the root project
if [[ "_" == "_${PROJECT_DIR}" ]]; then
  SCRIPT_DIR=$(dirname $0)
  PROJECT_DIR=$(cd ${SCRIPT_DIR}/.. && pwd)
  export PROJECT_DIR
fi;

# Default env variables (can be override in '.local/env.sh' file)
KEYSTORE_FILE=${PROJECT_DIR}/.local/android/Cesium.keystore
KEY_ALIAS=Cesium
KEYSTORE_PWD=

# Preparing Android environment
. ${PROJECT_DIR}/scripts/env-android.sh
[[ $? -ne 0 ]] && exit 1

APK_SIGNED_FILE=${ANDROID_OUTPUT_APK_RELEASE}/${ANDROID_OUTPUT_APK_PREFIX}-release-signed.apk
APK_UNSIGNED_FILE=${ANDROID_OUTPUT_APK_RELEASE}/${ANDROID_OUTPUT_APK_PREFIX}-release-unsigned.apk
APK_FILE_ALTERNATIVE=${ANDROID_OUTPUT_APK_RELEASE}/${ANDROID_OUTPUT_APK_PREFIX}-release.apk

cd ${PROJECT_DIR}


# Checking files
if [[ ! -f "${KEYSTORE_FILE}" ]]; then
  echo "ERROR: Keystore file not found: ${KEYSTORE_FILE}"
  exit 1
fi
if [[ ! -f "${APK_UNSIGNED_FILE}" ]]; then
  # Check in an alternative path (e.g. Android default signed file)
  if [[ ! -f "${APK_FILE_ALTERNATIVE}" ]]; then
    echo "ERROR: Unsigned APK file not found: ${APK_UNSIGNED_FILE}"
    exit 1
  fi
  APK_UNSIGNED_FILE=${APK_FILE_ALTERNATIVE}
fi

echo "--- Signing Android APK..."
echo ""

# Remove previous version (only if unsigned exists)
if [[ -f "${APK_SIGNED_FILE}" ]]; then
  echo "Delete previous signed APK file: ${APK_SIGNED_FILE}"
  rm -f ${APK_SIGNED_FILE}*
fi

#echo "Executing jarsigner..."
#jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 -storepass ${KEYSTORE_PWD} -keystore ${KEYSTORE_FILE} ${APK_UNSIGNED_FILE} ${KEY_ALIAS}
#[[ $? -ne 0 ]] && exit 1
#echo "Executing jarsigner [OK]"

cd ${ANDROID_BUILD_TOOLS_ROOT}
[[ $? -ne 0 ]] && exit 1

echo "Executing zipalign..."
./zipalign -v 4 ${APK_UNSIGNED_FILE} ${APK_SIGNED_FILE}
[[ $? -ne 0 ]] && exit 1
echo "Executing zipalign [OK]"
echo ""

echo "Executing apksigner..."
./apksigner sign --ks ${KEYSTORE_FILE} --ks-pass "pass:${KEYSTORE_PWD}" --ks-key-alias ${KEY_ALIAS} \
  --min-sdk-version ${ANDROID_OUTPUT_MIN_SDK_VERSION} \
  --max-sdk-version ${ANDROID_OUTPUT_MAX_SDK_VERSION} \
  ${APK_SIGNED_FILE}

[[ $? -ne 0 ]] && exit 1
echo "Executing apksigner [OK]"
echo ""

echo "Verify APK signature..."
./apksigner verify --verbose --print-certs ${APK_SIGNED_FILE}
[[ $? -ne 0 ]] && exit 1
echo "Verify APK signature [OK]"
echo ""

export APK_SIGNED_FILE
echo "--- Successfully generated signed APK at: ${APK_SIGNED_FILE}"
echo ""
exit 0
