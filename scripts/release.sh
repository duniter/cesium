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
current=$(grep -oP "version\": \"\d+.\d+.\d+((a|b)[0-9]+)?" package.json | grep -m 1 -oP "\d+.\d+.\d+((a|b)[0-9]+)?")
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
if [[ ! $2 =~ ^[0-9]+.[0-9]+.[0-9]+((a|b)[0-9]+)?$ || ! $3 =~ ^[0-9]+$ ]]; then
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

    # Bump the install.sh
    sed -i "s/echo \"v.*\" #lastest/echo \"v$2\" #lastest/g" install.sh
    ;;
  *)
    echo "No task given"
    exit 1
    ;;
esac


# Preparing Android environment
. ${PROJECT_DIR}/scripts/env-global.sh
if [[ $? -ne 0 ]]; then
  exit 1
fi

echo "----------------------------------"
echo "- Compiling sources..."
echo "----------------------------------"
cd ${PROJECT_DIR} || exit 1
gulp config build --env default_fr || exit 1

echo "----------------------------------"
echo "- Building Android artifact..."
echo "----------------------------------"
mkdir -p ${DIST_ANDROID} || exit 1
rm -rf ${DIST_ANDROID}/*.apk || exit 1
. scripts/build-android.sh --release
if [[ $? -ne 0 ]]; then
  exit 1
fi
APK_RELEASE_FILE="${ANDROID_OUTPUT_APK_RELEASE}/android-release.apk"
if [[ -f "${APK_RELEASE_FILE}" ]]; then
  mkdir -p ${DIST_ANDROID} || exit 1
  cp ${APK_RELEASE_FILE} ${DIST_ANDROID}/${PROJECT_NAME}-v$2-android.apk || exit 1
fi;

echo "----------------------------------"
echo "- Building web artifact..."
echo "----------------------------------"
cd ${PROJECT_DIR} || exit 1
gulp config --env default
gulp webBuild --release
if [[ $? -ne 0 ]]; then
  exit 1
fi
DIST_WEB_FILE="${DIST_WEB}/${PROJECT_NAME}-v$2-web.zip"
if [[ ! -f "${DIST_WEB_FILE}" ]]; then
  echo "ERROR: Missing web artifact at ${DIST_WEB_FILE}"
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
git add package.json config.xml install.sh www/js/config.js www/manifest.json
if [[ $? -ne 0 ]]; then
  exit 1
fi
git commit -m "v$2"
git tag -f -a "v$2" -m "${description}"
git push origin "v$2"
git push
if [[ $? -ne 0 ]]; then
  exit 1
fi

# Commit android project
cd ${PROJECT_DIR}/platforms/android
git reset HEAD
git add -A
git commit -m "v$2"
git tag -f -a "v$2" -m "${description}"
git push origin "v$2"
git push
if [[ $? -ne 0 ]]; then
  exit 1
fi

echo "**********************************"
echo "* Uploading artifacts to Github..."
echo "**********************************"
# Pause (wait propagation to from git.duniter.org to github)
echo " Waiting 40s, for propagation to github..."
sleep 40s

. ${PROJECT_DIR}/scripts/github.sh $1 ''"$description"''
if [[ $? -ne 0 ]]; then
    exit 1
fi

echo "----------------------------------"
echo "- Building desktop artifacts..."
echo "----------------------------------"


if [[ -d "${PROJECT_DIR}/dist/desktop" ]]; then
  cd "${PROJECT_DIR}/dist/desktop"

  # Fetch last updates
  git fetch origin && git merge origin/master || exit 1

  # Build desktop assets
  ./release.sh $2
  if [[ $? -ne 0 ]]; then
      exit 1
  fi
else
  echo "ERROR: dist/desktop not found -> Make sure git submodule has been init!"
  exit 1
fi;

# Back to nodejs
cd ${PROJECT_DIR}
nvm use ${NODEJS_VERSION}

echo "**********************************"
echo "* Build release succeed !"
echo "**********************************"

