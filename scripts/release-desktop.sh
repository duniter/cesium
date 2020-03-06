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

if [[ -d "${PROJECT_DIR}/dist/desktop" ]]; then
  cd "${PROJECT_DIR}/dist/desktop"

  # Fetch last updates
  git fetch origin && git merge origin/master || exit 1

  # Build desktop assets
  ./release.sh $1
  if [[ $? -ne 0 ]]; then
      exit 1
  fi
else
  echo "ERROR: dist/desktop not found -> Make sure git submodule has been init!"
  exit 1
fi;
