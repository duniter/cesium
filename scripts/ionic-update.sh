#!/bin/bash

# Get to the root project
if [[ "_" == "_${PROJECT_DIR}" ]]; then
  SCRIPT_DIR=$(dirname $0)
  PROJECT_DIR=$(cd ${SCRIPT_DIR}/.. && pwd)
  export PROJECT_DIR
fi;

# Preparing Android environment
. ${PROJECT_DIR}/scripts/env-global.sh
if [[ $? -ne 0 ]]; then
  exit 1
fi

cd ${PROJECT_DIR}

echo "Updating Ionic..."
npm update -g ionic@latest

echo "Updating Cordova..."
npm update -g cordova@latest
if [[ $? -ne 0 ]]; then
  exit 1
fi

echo "Updating Cordova plugins..."
ionic cordova platform update android --save
if [[ $? -ne 0 ]]; then
  exit 1
fi
