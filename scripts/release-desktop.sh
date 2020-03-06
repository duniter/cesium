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

### Control that the script is run on `dev` branch
branch=$(git rev-parse --abbrev-ref HEAD)
if [[ ! "$branch" = "master" ]];
then
  echo ">> This script must be run under \`master\` branch"
  exit 1
fi

### Get version to release
current=$(grep -P "version\": \"\d+.\d+.\d+(\w*)" package.json | grep -m 1 -oP "\d+.\d+.\d+(\w*)")
if [[ "_$current" == "_" ]]; then
  echo "Unable to read the current version in 'package.json'. Please check version format is: x.y.z (x and y should be an integer)."
  exit 1;
fi

### Check submodule exists
if [[ ! -d "${PROJECT_DIR}/dist/desktop" ]]; then
  echo "ERROR: dist/desktop not found -> Make sure git submodule has been init!"
  exit 1
fi;

### Sign extension
case "$1" in
  pre|rel)
    echo "Building v$current desktop artifacts..."
    ;;
  *)
    echo "No task given"
    echo "Usage:"
      echo " > $0 pre|rel"
    exit 1
    ;;
esac

cd "${PROJECT_DIR}/dist/desktop"

# Fetch last updates
git fetch origin && git merge origin/master || exit 1

# Build desktop assets
./release.sh $current
if [[ $? -ne 0 ]]; then
    exit 1
fi

