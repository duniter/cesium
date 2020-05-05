#!/bin/bash

# Get to the root project
if [[ "_" == "_${PROJECT_DIR}" ]]; then
  SCRIPT_DIR=$(dirname $0)
  PROJECT_DIR=$(cd ${SCRIPT_DIR}/.. && pwd)
  export PROJECT_DIR
fi;

# Preparing Android environment
. ${PROJECT_DIR}/scripts/env-android.sh
[[ $? -ne 0 ]] && exit 1

cd ${PROJECT_DIR}

# ----------------------------------
# Check templates files build
# ----------------------------------

# Generate templates JS file
echo "--------------------------------"
echo "Building templates file... [1/2]"
gulp template > /dev/null
[[ $? -ne 0 ]] && exit 1

TEMPLATES_FILE="${PROJECT_DIR}/www/dist/dist_js/app/templates.js"
PLUGIN_TEMPLATES_FILE="${PROJECT_DIR}/www/dist/dist_js/plugins/templates.js"
if [[ ! -f ${TEMPLATES_FILE} ]] || [[ ! -f ${PLUGIN_TEMPLATES_FILE} ]]; then
  echo "ERROR - Missing file ${TEMPLATES_FILE} or ${PLUGIN_TEMPLATES_FILE}"
  exit 1;
fi;

# Keep a copy
rm -f "${TEMPLATES_FILE}.tmp"
rm -f "${PLUGIN_TEMPLATES_FILE}.tmp"
mv "${TEMPLATES_FILE}" "${TEMPLATES_FILE}.tmp"
mv "${PLUGIN_TEMPLATES_FILE}" "${PLUGIN_TEMPLATES_FILE}.tmp"

# Second generation
echo "Building templates file... [2/2]"
gulp template > /dev/null
[[ $? -ne 0 ]] && exit 1
echo "Building templates file [OK]"

# Check diff
echo "Checking diff between templates files..."
diff "${TEMPLATES_FILE}" "${TEMPLATES_FILE}.tmp" > /tmp/templates.js.diff
if [[ $? -ne 0 ]]; then
  echo "ERROR: Detected some differences: build is not reproducible!"
  echo "  Diff are visible at: /tmp/templates.js.diff"
  exit 1;
fi;
diff "${PLUGIN_TEMPLATES_FILE}" "${PLUGIN_TEMPLATES_FILE}.tmp" > /tmp/plugin_templates.js.diff
if [[ $? -ne 0 ]]; then
  echo "ERROR: Detected some differences: build is not reproducible!"
  echo "  Diff are visible at: /tmp/plugin_templates.js.diff"
  exit 1;
fi;
echo "Checking diff between templates files... [OK]"

# ----------------------------------
# Check web extension build
# ----------------------------------

# Clean generated files (1/2)
rm www/css/*.app*.css
rm -rf www/dist
rm -rf dist/web

# Compile (1/2)
echo "----------------------------"
echo "Building web extension... [1/2]"
gulp webExtBuild --release > /dev/null

WEB_EXT_DIR="${PROJECT_DIR}/dist/web/ext"
if [[ $? -ne 0 ]] || [[ ! -d "${WEB_EXT_DIR}" ]]; then
  echo "ERROR - Build failed: missing folder ${WEB_EXT_DIR}"
  exit 1;
fi;

# Keep a copy
WEB_EXT_COPY_DIR="/tmp/cesium-extention"
rm -rf "${WEB_EXT_COPY_DIR}"
mv "${WEB_EXT_DIR}" "${WEB_EXT_COPY_DIR}"

# Clean generated files (2/2)
rm www/css/*.app*.css
rm -rf www/dist
rm -rf dist/web

# Compile web extension (2/2)
echo "Building web extension... [2/2]"
gulp webExtBuild --release > /dev/null
[[ $? -ne 0 ]] && exit 1

echo "Building web extension... [OK]"

echo "Checking diff between builds..."
DIFF_FILE=/tmp/cesium-extention.diff
diff -arq "${WEB_EXT_DIR}" "${WEB_EXT_COPY_DIR}" > ${DIFF_FILE}
if [[ $? -ne 0 ]]; then
  echo "Checking diff between builds... [FAILED] Build is NOT reproducible!"
  echo "Please check following diff:"
  cat ${DIFF_FILE}

  # Clean temporary dir
  rm -rf ${WEB_EXT_COPY_DIR}

  exit 1;
fi;

# Final message
echo "Checking diff between builds... [SUCCESS] Build is reproducible."

# Clean temporary dir (silently)
rm -rf ${WEB_EXT_COPY_DIR} > /dev/null
rm /tmp/cesium-extention.diff
