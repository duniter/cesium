#!/bin/bash

# Get to the root project
if [[ "_" == "_${PROJECT_DIR}" ]]; then
  SCRIPT_DIR=$(dirname $0)
  PROJECT_DIR=$(cd ${SCRIPT_DIR}/.. && pwd)
  export PROJECT_DIR
fi;

cd ${PROJECT_DIR}

### Control that the script is run on `dev` branch
branch=$(git rev-parse --abbrev-ref HEAD)
if [[ ! "$branch" == "master" ]];
then
  echo ">> This script must be run under \`master\` branch"
  exit 1
fi

### Get current version (package.json)
current=$(grep -m1 -P "version\": \"\d+.\d+.\d+(-\w+[0-9]*)?" package.json | grep -oP "\d+.\d+.\d+(-\w+[0-9]*)?")
if [[ "_$current" == "_" ]]; then
  echo "Unable to read the current version in 'package.json'. Please check version format is: x.y.z (x and y should be an integer)."
  exit 1;
fi
echo "Current version: $current"

### Get current version for Android
currentAndroid=$(grep -oP "android-versionCode=\"[0-9]+\"" config.xml | grep -oP "\d+")
if [[ "_$currentAndroid" == "_" ]]; then
  echo "Unable to read the current Android version in 'config.xml'. Please check version format is an integer."
  exit 1;
fi
echo "Current Android version: $currentAndroid"

# Check version format
if [[ ! $2 =~ ^[0-9]+.[0-9]+.[0-9]+(-(alpha|beta|rc)[-0-9]*)?$ || ! $3 =~ ^[0-9]+$ ]]; then
  echo "Wrong version format"
  echo "Usage:"
  echo " > ./release.sh [pre|rel] <version>  <android-version> <release_description>"
  echo "with:"
  echo " - pre: use for pre-release"
  echo " - rel: for full release"
  echo " - version: x.y.z"
  echo " - android-version: nnn"
  echo " - release_description: a comment on release"
  exit 1
fi

echo "new build version: $2"
echo "new build android version: $3"
case "$1" in
  rel|pre)
    # Change the version in files: 'package.json' and 'config.xml'
    sed -i "s/version\": \"$current\"/version\": \"$2\"/g" package.json
    currentConfigXmlVersion=$(grep -oP "version=\"\d+.\d+.\d+((a|b)[0-9]+)?\"" config.xml | grep -oP "\d+.\d+.\d+((a|b)[0-9]+)?")
    sed -i "s/ version=\"$currentConfigXmlVersion\"/ version=\"$2\"/g" config.xml
    sed -i "s/ android-versionCode=\"$currentAndroid\"/ android-versionCode=\"$3\"/g" config.xml

    # Change version in file: 'www/manifest.json'
    currentManifestJsonVersion=$(grep -oP "version\": \"\d+.\d+.\d+((a|b)[0-9]+)?\"" www/manifest.json | grep -oP "\d+.\d+.\d+((a|b)[0-9]+)?")
    sed -i "s/version\": \"$currentManifestJsonVersion\"/version\": \"$2\"/g" www/manifest.json

    # Change version in file: 'resources/web-ext/manifest.json'
    currentExtManifestJsonVersion=$(grep -oP "version\": \"\d+.\d+.\d+((a|b)[0-9]+)?\"" resources/web-ext/manifest.json | grep -oP "\d+.\d+.\d+((a|b)[0-9]+)?")
    sed -i "s/version\": \"$currentExtManifestJsonVersion\"/version\": \"$2\"/g" resources/web-ext/manifest.json

    # Bump the install.sh
    sed -i "s/echo \"v.*\" #lastest/echo \"v$2\" #lastest/g" install.sh
    ;;
  *)
    echo "No task given"
    exit 1
    ;;
esac


# Preparing the environment
. ${PROJECT_DIR}/scripts/env-global.sh
[[ $? -ne 0 ]] && exit 1


echo "----------------------------------"
echo "- Compiling sources..."
echo "----------------------------------"
cd ${PROJECT_DIR} || exit 1
gulp config build --env default || exit 1

echo "----------------------------------"
echo "- Building Android artifact..."
echo "----------------------------------"
cd ${PROJECT_DIR}/scripts || exit 1
./release-android.sh
#[[ $? -ne 0 ]] && exit 1
APK_SIGNED_FILE="${ANDROID_OUTPUT_APK_RELEASE}/${ANDROID_OUTPUT_APK_PREFIX}-release-signed.apk"
if [[ ! -f "${APK_SIGNED_FILE}" ]]; then
  echo "Missing signed APK file at: ${APK_SIGNED_FILE}"
  exit 1
fi

echo "----------------------------------"
echo "- Building web and extension artifacts..."
echo "----------------------------------"

# Generate config (only once, to keep same config if web and web-extension artifacts)
cd ${PROJECT_DIR} || exit 1
gulp config --env default

# Run web build
gulp webBuild --release
[[ $? -ne 0 ]] && exit 1

gulp webExtBuild --release
[[ $? -ne 0 ]] && exit 1

# check files exists
DIST_WEB_FILE="${DIST_WEB}/${PROJECT_NAME}-v$2-web.zip"
if [[ ! -f "${DIST_WEB_FILE}" ]]; then
  echo "ERROR: Missing web artifact at ${DIST_WEB_FILE}"
  exit 1
fi;
DIST_WEB_EXT_FILE="${DIST_WEB}/${PROJECT_NAME}-v$2-extension.zip"
if [[ ! -f "${DIST_WEB_EXT_FILE}" ]]; then
  echo "ERROR: Missing web-ext artifact at ${DIST_WEB_EXT_FILE}"
  exit 1
fi;

echo "----------------------------------"
echo "- Executing git push, with tag: v$2"
echo "----------------------------------"
description="$4"
if [[ "_$description" == "_" ]]; then
   description="Release v$2"
fi

# Commit
cd ${PROJECT_DIR} || exit 1
git reset HEAD
git add package.json config.xml install.sh www/js/config.js www/manifest.json resources/web-ext/manifest.json
[[ $? -ne 0 ]] && exit 1
git commit -m "v$2"
git tag -f -a "v$2" -m "${description}"
# Push the tag
git push -f origin "v$2"
# Push the master branch
git push -f origin
[[ $? -ne 0 ]] && exit 1

echo "----------------------------------"
echo "- Uploading web extension to Mozilla ..."
echo "----------------------------------"
. ${PROJECT_DIR}/scripts/release-sign-extension.sh $1
# FIXME: always failed, but continue
#[[ $? -ne 0 ]] && exit 1

echo "----------------------------------"
echo "- Uploading artifacts to Github ..."
echo "----------------------------------"
# Pause (wait propagation to from git.duniter.org to github)
echo " Waiting 40s, for propagation to github..." && sleep 40s
. ${PROJECT_DIR}/scripts/release-to-github.sh $1 ''"$description"''
[[ $? -ne 0 ]] && exit 1


echo "----------------------------------"
echo "- Building desktop artifacts..."
echo "----------------------------------"
. ${PROJECT_DIR}/scripts/release-desktop.sh $1
[[ $? -ne 0 ]] && exit 1


echo "----------------------------------"
echo "- Push git android project..."
echo "----------------------------------"
. ${PROJECT_DIR}/scripts/release-android-sources.sh $2

echo "**********************************"
echo "* Build release succeed !"
echo "**********************************"

cd ${PROJECT_DIR}

# Back to nodejs project version
nvm use ${NODEJS_VERSION}

