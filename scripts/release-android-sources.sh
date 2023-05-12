#!/bin/bash

# Get to the root project
if [[ "_" == "_${PROJECT_DIR}" ]]; then
  SCRIPT_DIR=$(dirname $0)
  PROJECT_DIR=$(cd ${SCRIPT_DIR}/.. && pwd)
  export PROJECT_DIR
fi;


### Get version to release
cd ${PROJECT_DIR}
current=$(grep -m1 -P "version\": \"\d+.\d+.\d+(-\w+[-0-9]*)?\"" package.json | grep -oP "\d+.\d+.\d+(-\w+[-0-9]*)?")
if [[ "_$current" == "_" ]]; then
  echo " - Make sure the file 'package.json' exists and is readable."
  echo " - Check version format is: x.y.z (x and y should be an integer)"
  exit 1
fi

# Preparing the environment
source ${PROJECT_DIR}/scripts/env-global.sh
[[ $? -ne 0 ]] && exit 1

# Make sure to checkout the source project
if ! test -d "${SOURCES_ANDROID}"; then
  echo "-- Checkout submodules (dist/android/sources) ..."
  cd "${PROJECT_DIR}"
  git submodule init && git submodule sync && git submodule update --remote --merge
  if ! test $? == 0; then
    echo "ERROR: Unable to sync git submodule. Will not be able commit android sources !"
    #exit 1
  else
    echo "-- Checkout submodules (dist/android/sources) [OK]"
  fi
fi

if test -d "${SOURCES_ANDROID}"; then

  # Revert changes in the Android sources project
  cd ${SOURCES_ANDROID} || exit 1
  git fetch && git reset --hard --merge HEAD

  # Update sources, from platforms/android
  echo "--- Copy Android sources from 'platforms/android' to '${SOURCES_ANDROID}' ..."
  rsync -rlptgocq --exclude=.* --exclude=build --exclude=release-signing.* --exclude=*.keystore --delete --force "${PROJECT_DIR}/platforms/android/" "${SOURCES_ANDROID}/"

  echo "--- Copy Android sources [OK] ..."
  echo ""

  echo "--- Git push Android sources, and tag as 'v$current'..."
  cd ${SOURCES_ANDROID} || exit 1
  git add -A
  git commit -a -m "v$current"
  git tag -f -a "v$current" -m "Release v$current"
  # Push the tag
  git push -f origin "v$current"
  # Push the master branch
  git push -f origin
  if [[ $? -ne 0 ]]; then
    echo "ERROR: cannot push Android sources at '${SOURCES_ANDROID}' ! Continue anyway..."
  else
    echo "--- Git push Android sources, and tag [OK]"
  fi
fi
