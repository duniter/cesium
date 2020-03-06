#!/bin/bash

# Get to the root project
if [[ "_" == "_${PROJECT_DIR}" ]]; then
  SCRIPT_DIR=$(dirname $0)
  PROJECT_DIR=$(cd ${SCRIPT_DIR}/.. && pwd)
  export PROJECT_DIR
fi;

cd ${PROJECT_DIR}

# Preparing the environment
. ${PROJECT_DIR}/scripts/env-global.sh
if [[ $? -ne 0 ]]; then
  exit 1
fi

# Commit android project
cd ${PROJECT_DIR}/platforms/android || exit 1
git reset HEAD
git add -A
git commit -m "v$1"
git tag -f -a "v$1" -m "Release v$1"
# Push the tag
git push -f origin "v$1"
# Push the master branch
git push -f origin
if [[ $? -ne 0 ]]; then
  echo "ERROR: cannot push platform/android project ! Continue anyway..."
fi
