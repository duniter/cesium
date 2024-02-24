#!/bin/bash

{ # this ensures the entire script is downloaded #

is_installed() {
  type "$1" > /dev/null 2>&1
}

CESIUM_DIR=${1:-$(pwd)/cesium}

latest_version() {
  echo "v1.7.13" # lastest
}

api_release_url() {
  echo "https://api.github.com/repos/duniter/cesium/releases/tags/$(latest_version)"
}

download() {
  if is_installed "curl"; then
    curl -qkL $*
  elif is_installed "wget"; then
    # Emulate curl with wget
    ARGS=$(echo "$*" | command sed -e 's/--progress-bar /--progress=bar /' \
                           -e 's/-L //' \
                           -e 's/-I /--server-response /' \
                           -e 's/-s /-q /' \
                           -e 's/-o /-O /' \
                           -e 's/-C - /-c /')
    wget $ARGS
  fi
}

install_from_github() {

  local RELEASE=$(curl -XGET -i "$(api_release_url)")
  local CESIUM_URL=$(echo "$RELEASE" | grep -P '"browser_download_url": "[^"]+' | grep -oP "https://[a-zA-Z0-9/.-]+-web.zip" | head -n 1)
  local CESIUM_ARCHIVE="$CESIUM_DIR/cesium.zip"

  if [ ! -d "$CESIUM_DIR" ]; then
    mkdir -p "$CESIUM_DIR"
  elif [ -f "$CESIUM_ARCHIVE" ]; then
    echo "WARNING: Deleting existing archive [$CESIUM_ARCHIVE]"
    rm "$CESIUM_ARCHIVE"
  fi

  echo "Downloading [$CESIUM_URL]"
  download "$CESIUM_URL" -o "$CESIUM_ARCHIVE" || {
    echo >&2 "Failed to download '$CESIUM_URL'"
    return 4
  }

  echo "Unarchiving to $CESIUM_DIR"
  unzip -o "$CESIUM_ARCHIVE" -d "$CESIUM_DIR"
  rm "$CESIUM_ARCHIVE"

  echo "Cesium successfully installed at $CESIUM_DIR"
}

do_install() {

  if ! is_installed "curl" && ! is_installed "wget"; then
    echo "=> Neither 'curl' nor 'wget' is available. Please install one of them."
    exit 1
  fi

  if ! is_installed "unzip"; then
    echo "=> 'unzip' is not available. You will likely need to install the 'unzip' package."
    exit 1
  fi

  install_from_github
}

#
# Unsets the various functions defined
# during the execution of the install script
#
reset() {
  unset -f reset is_installed latest_version api_release_url download install_from_github do_install
}

[ "_$CESIUM_ENV" = "_testing" ] || do_install "$1"

} # this ensures the entire script is downloaded #
