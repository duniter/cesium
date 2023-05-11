#!/bin/bash

# Get to the root project
if [[ "_" == "_${PROJECT_DIR}" ]]; then
  SCRIPT_DIR=$(dirname $0)
  PROJECT_DIR=$(cd ${SCRIPT_DIR}/.. && pwd)
  export PROJECT_DIR
fi;

# Preparing Android environment
cd ${PROJECT_DIR}
source ${PROJECT_DIR}/scripts/env-global.sh

### Control that the script is run on `dev` branch
branch=$(git rev-parse --abbrev-ref HEAD)
if [[ ! "$branch" = "master" ]];
then
  echo ">> This script must be run under \`master\` branch"
  exit 1
fi

### Get version to release
current=$(grep -m1 -P "version\": \"\d+.\d+.\d+(-\w+[0-9]*)?" package.json | grep -oP "\d+.\d+.\d+(-\w+[0-9]*)?")
if [[ "_$current" == "_" ]]; then
  echo " - Make sure the file 'package.json' exists and is readable."
  echo " - Check version format is: x.y.z (x and y should be an integer)"
  exit 1
fi

###  get auth token
if [[ "_${GITHUB_TOKEN}" == "_" ]]; then
  # Get it from user config dir
  GITHUB_TOKEN=$(cat ~/.config/${PROJECT_NAME}/.github)
fi
if [[ "_${GITHUB_TOKEN}" != "_" ]]; then
    GITHUT_AUTH="Authorization: token ${GITHUB_TOKEN}"
else
    echo "ERROR: Unable to find github authentication token file: "
    echo " - You can create such a token at https://github.com/settings/tokens > 'Generate a new token'."
    echo " - [if CI] Add a pipeline variable named 'GITHUB_TOKEN';"
    echo " - [else] Or copy/paste the token into the file '~/.config/${PROJECT_NAME}/.github'."
    exit 1
fi

### check arguments
case "$1" in
  del)
    result=$(curl -i "$REPO_API_URL/releases/tags/v$current")
    release_url=$(echo "$result" | grep -P "\"url\": \"[^\"]+"  | grep -oP "$REPO_API_URL/releases/\d+")
    if [[ $release_url != "" ]]; then
        echo "--- Deleting existing release..."
        curl -H ''"$GITHUT_AUTH"''  -XDELETE $release_url
    fi
    exit 0;
  ;;

  pre)
    prerelease="true"
    echo "--- Creating new pre-release v$current..."
    ;;

  rel)
    prerelease="false"
    echo "--- Creating new release v$current..."
    ;;
  *)
    echo "No task given, or wrong arguments"
    echo "Usage:"
    echo " > $0 del|pre|rel <release_description>"
    echo "With:"
    echo " - del: delete existing release"
    echo " - pre: use for pre-release"
    echo " - rel: for full release"
    exit 1
    ;;
esac

description=$(echo $2)
if [[ "_$description" = "_" ]]; then
    description="Release v$current"
fi

result=$(curl -s -H ''"$GITHUT_AUTH"'' "$REPO_API_URL/releases/tags/v$current")
release_url=$(echo "$result" | grep -P "\"url\": \"[^\"]+" | grep -oP "https://[A-Za-z0-9/.-]+/releases/\d+")
if [[ "_$release_url" != "_" ]]; then
  echo "--- Deleting existing release... $release_url"
  result=$(curl -H ''"$GITHUT_AUTH"'' -s -XDELETE $release_url)
  if [[ "_$result" != "_" ]]; then
      error_message=$(echo "$result" | grep -P "\"message\": \"[^\"]+" | grep -oP ": \"[^\"]+\"")
      echo "Delete existing release failed with error$error_message"
      exit 1
  fi
else
  echo "Release not exists yet on github."
fi

echo "--- Clean previous SHA256 files..."
rm -rf ${PROJECT_DIR}/dist/**/*.sha256
echo ""

echo "--- Creating new release..."
echo " - tag: v$current"
echo " - description: $description"
result=$(curl -X POST -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" -H ''"$GITHUT_AUTH"'' -s $REPO_API_URL/releases -d '{"tag_name": "v'"$current"'","target_commitish": "master","name": "'"$current"'","body": "'"$description"'","draft": false,"prerelease": '"$prerelease"'}')
upload_url=$(echo "$result" | grep -P "\"upload_url\": \"[^\"]+"  | grep -oP "https://[A-Za-z0-9/.-]+")
if [[ "_$upload_url" = "_" ]]; then
  echo "Failed to create new release for repo $REPO."
  echo "Server response:"
  echo "$result"
  exit 1
fi

### Sending files
echo "--- Uploading files to ${upload_url} ..."

# Upload web file
WEB_BASENAME="${PROJECT_NAME}-v$current-web.zip"
WEB_FILE="${DIST_WEB}/${WEB_BASENAME}"
if [[ -f "${WEB_FILE}" ]]; then
  result=$(curl -s -H ''"$GITHUT_AUTH"'' -H 'Content-Type: application/zip' -T "${WEB_FILE}" "${upload_url}?name=${WEB_BASENAME}")
  browser_download_url=$(echo "$result" | grep -P "\"browser_download_url\":[ ]?\"[^\"]+" | grep -oP "\"browser_download_url\":[ ]?\"[^\"]+"  | grep -oP "https://[A-Za-z0-9/.-]+")
  WEB_SHA256=$(cd ${DIST_WEB} && sha256sum "${WEB_BASENAME}")
  echo " - ${browser_download_url}  | SHA256 Checksum: ${WEB_SHA256}"
  echo "${WEB_SHA256}  ${WEB_BASENAME}" > "${WEB_FILE}.sha256"
  result=$(curl -s -H ''"$GITHUT_AUTH"'' -H 'Content-Type: text/plain' -T "${WEB_FILE}.sha256" "${upload_url}?name=${WEB_BASENAME}.sha256")
else
  echo " - ERROR: Web release (ZIP) not found! Skipping."
  missing_file=true
fi

# Upload web extension (ZIP) file
WEB_EXT_ZIP_BASENAME="${PROJECT_NAME}-v$current-extension.zip"
WEB_EXT_ZIP_FILE="${DIST_WEB}/${WEB_EXT_ZIP_BASENAME}"
if [[ -f "${WEB_EXT_ZIP_FILE}" ]]; then
  result=$(curl -s -H ''"$GITHUT_AUTH"'' -H 'Content-Type: application/zip' -T "${WEB_EXT_ZIP_FILE}" "${upload_url}?name=${WEB_EXT_ZIP_BASENAME}")
  browser_download_url=$(echo "$result" | grep -P "\"browser_download_url\":[ ]?\"[^\"]+" | grep -oP "\"browser_download_url\":[ ]?\"[^\"]+"  | grep -oP "https://[A-Za-z0-9/.-]+")
  WEB_EXT_ZIP_SHA256=$(cd ${DIST_WEB} && sha256sum "${WEB_EXT_ZIP_BASENAME}")
  echo " - ${browser_download_url}  | Checksum: ${WEB_EXT_ZIP_SHA256}"
  echo "${WEB_EXT_ZIP_SHA256}  ${WEB_EXT_ZIP_BASENAME}" > "${WEB_EXT_ZIP_FILE}.sha256"
  result=$(curl -s -H ''"$GITHUT_AUTH"'' -H 'Content-Type: text/plain' -T "${WEB_EXT_ZIP_FILE}.sha256" "${upload_url}?name=${WEB_EXT_ZIP_BASENAME}.sha256")
else
  echo " - ERROR: Web extension artifact (ZIP) not found! Skipping."
  missing_file=true
fi

# Upload web extension (XPI) file
WEB_EXT_XPI_BASENAME="${PROJECT_NAME}-v$current-extension-firefox.xpi"
WEB_EXT_XPI_FILE="${DIST_WEB}/${WEB_EXT_XPI_BASENAME}"
if [[ -f "${WEB_EXT_XPI_FILE}" ]]; then
  result=$(curl -s -H ''"$GITHUT_AUTH"'' -H 'Content-Type: application/zip' -T "${WEB_EXT_XPI_FILE}" "${upload_url}?name=${WEB_EXT_XPI_BASENAME}")
  browser_download_url=$(echo "$result" | grep -P "\"browser_download_url\":[ ]?\"[^\"]+" | grep -oP "\"browser_download_url\":[ ]?\"[^\"]+"  | grep -oP "https://[A-Za-z0-9/.-]+")
  WEB_EXT_XPI_SHA256=$(cd ${DIST_WEB} && sha256sum "${WEB_EXT_XPI_BASENAME}")
  echo " - ${browser_download_url}  | Checksum: ${WEB_EXT_XPI_SHA256}"
  echo "${WEB_EXT_XPI_SHA256}  ${WEB_EXT_XPI_BASENAME}" > "${WEB_EXT_XPI_BASENAME}.sha256"
  result=$(curl -s -H ''"$GITHUT_AUTH"'' -H 'Content-Type: text/plain' -T "${WEB_EXT_XPI_FILE}.sha256" "${upload_url}?name=${WEB_EXT_XPI_BASENAME}.sha256")
else
  echo " - ERROR: Web signed extension artifact (XPI) not found! Skipping."
  missing_file=true
fi

# Upload Android APK file
APK_BASENAME="${PROJECT_NAME}-v${current}-android.apk"
APK_SIGNED_FILE="${ANDROID_OUTPUT_APK_RELEASE}/${ANDROID_OUTPUT_APK_PREFIX}-release-signed.apk"
if [[ -f "${APK_SIGNED_FILE}" ]]; then
  # Copy to dist/android
  mkdir -p ${DIST_ANDROID}
  cp -f "${APK_SIGNED_FILE}" "${DIST_ANDROID}/${APK_BASENAME}"

  result=$(curl -s -H ''"$GITHUT_AUTH"'' -H 'Content-Type: application/vnd.android.package-archive' -T "${APK_SIGNED_FILE}" "${upload_url}?name=${APK_BASENAME}")
  browser_download_url=$(echo "$result" | grep -P "\"browser_download_url\":[ ]?\"[^\"]+" | grep -oP "\"browser_download_url\":[ ]?\"[^\"]+"  | grep -oP "https://[A-Za-z0-9/.-]+")
  APK_SHA256=$(sha256sum "${APK_SIGNED_FILE}" | sed 's/ /\n/gi' | head -n 1)
  echo " - ${browser_download_url}  | SHA256 Checksum: ${APK_SHA256}"
  echo "${APK_SHA256}  ${APK_BASENAME}" > "${APK_SIGNED_FILE}.sha256"
  result=$(curl -s -H ''"$GITHUT_AUTH"'' -H 'Content-Type: text/plain' -T "${APK_SIGNED_FILE}.sha256" "${upload_url}?name=${APK_BASENAME}.sha256")
else
  echo "- ERROR: Android release (APK) not found! Skipping."
  missing_file=true
fi

echo ""
if [[ ${missing_file} == true ]]; then
  echo "-------------------------------------------"
  echo "ERROR: missing some artifacts (see logs)"
  echo " -> Release url: ${REPO_PUBLIC_URL}/releases/tag/${version}"
  exit 1
else
  echo "-------------------------------------------"
  echo "Successfully uploading files !"
  echo " -> Release url: ${REPO_PUBLIC_URL}/releases/tag/${version}"
  exit 0
fi
