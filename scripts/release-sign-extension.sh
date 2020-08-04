#!/bin/bash

# Get to the root project
if [[ "_" == "_${PROJECT_DIR}" ]]; then
  SCRIPT_DIR=$(dirname $0)
  PROJECT_DIR=$(cd ${SCRIPT_DIR}/.. && pwd)
  export PROJECT_DIR
fi;

# Preparing Android environment
cd ${PROJECT_DIR}
. ${PROJECT_DIR}/scripts/env-global.sh

XPI_BASENAME=${PROJECT_NAME}-$current-an+fx.xpi
XPI_FILE=${PROJECT_DIR}/dist/web/build/${XPI_BASENAME}
XPI_FINAL_BASENAME=${PROJECT_NAME}-v$current-extension-firefox.xpi
XPI_FINAL_FILE=${PROJECT_DIR}/dist/web/build/${XPI_FINAL_BASENAME}

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
echo "Sending v$current extension for Mozilla..."

### Check AMO account
if [[ "_" == "_${AMO_JWT_ISSUER}" || "_" == "_${AMO_JWT_SECRET}" ]]; then
    echo "ERROR: Unable to find Addons Modzilla account: "
    echo " - Please add environment variables 'AMO_JWT_ISSUER' or 'AMO_JWT_SECRET', then retry."
    echo " - You can use the file './local/env.sh'."
    exit 1
fi

### Sign extension
case "$1" in
  pre)
      web-ext sign "--api-key=${AMO_JWT_ISSUER}" "--api-secret=${AMO_JWT_SECRET}" "--source-dir=${PROJECT_DIR}/dist/web/ext" "--artifacts-dir=${PROJECT_DIR}/dist/web/build"  --id=${WEB_EXT_ID} --channel=unlisted
      if [[ $? -ne 0 ]]; then
        if [[ -f "${XPI_FILE}" || -f "${XPI_FINAL_FILE}" ]]; then
          echo "WARN: web-ext failed! Continue anyway, because output file exists"
        else
          exit 1
        fi;
      fi
    ;;
  rel)
      web-ext sign "--api-key=${AMO_JWT_ISSUER}" "--api-secret=${AMO_JWT_SECRET}" "--source-dir=${PROJECT_DIR}/dist/web/ext" "--artifacts-dir=${PROJECT_DIR}/dist/web/build"  --id=${WEB_EXT_ID} --channel=listed
      # Comment out, because always failed with message:
      #   "Your add-on has been submitted for review. It passed validation but could not be automatically signed because this is a listed add-on."
      #if [[ $? -ne 0 ]]; then
      #  exit 1
      #fi
    ;;
  *)
    echo "No task given"
    echo "Usage:"
      echo " > $0 pre|rel <release_description>"
    exit 1
    ;;
esac

## Rename output file
if [[ -f "${XPI_FILE}" ]]; then

  # add a 'v' before version
  mv ${XPI_FILE} ${XPI_FINAL_FILE}
fi
