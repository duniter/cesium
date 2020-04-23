#!/bin/bash

# Get to the root project
if [[ "_" == "_${PROJECT_DIR}" ]]; then
  SCRIPT_DIR=$(dirname $0)
  PROJECT_DIR=$(cd ${SCRIPT_DIR}/.. && pwd)
  export PROJECT_DIR
fi;

# Preparing Android environment
. ${PROJECT_DIR}/scripts/env-android.sh
if [[ $? -ne 0 ]]; then
  exit 1
fi

cd ${PROJECT_DIR}

echo "Updating Ionic..."
npm update -g @ionic/cli

echo "Updating Cordova..."
npm update -g cordova@latest
if [[ $? -ne 0 ]]; then
  exit 1
fi

if [[ ! -d "${PROJECT_DIR}/plugins" ]]; then
  echo "Installing Cordova plugins..."
  ionic cordova prepare
fi

#echo "Updating Cordova plugins..."
#ionic cordova platform update android --save
#if [[ $? -ne 0 ]]; then
#  exit 1
#fi
