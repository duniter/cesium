
# Deploy Cesium

## Bash script
 
This is a bash script example, that you can use to deploy the latest release.
  
This script will create or replace a directory name `cesium`, where application will be unpack.
 
**Be aware** that the destination directory will be created **where the script is**.

```bash
#!/bin/bash

READLINK=`which readlink`
if [ -z "$READLINK"  ]; then
  message "Required tool 'readlink' is missing. Please install before launch \"$0\" file."
  exit 1
fi

# ------------------------------------------------------------------
# Ensure BASEDIR points to the directory where the soft is installed.
# ------------------------------------------------------------------
SCRIPT_LOCATION=$0
if [ -x "$READLINK" ]; then
  while [ -L "$SCRIPT_LOCATION" ]; do
    SCRIPT_LOCATION=`"$READLINK" -e "$SCRIPT_LOCATION"`
  done
fi

export BASEDIR=`dirname "$SCRIPT_LOCATION"`

cd $BASEDIR

echo "Installing cesium into '$BASEDIR/cesium'..."

wget -qO- https://git.duniter.org/clients/cesium-grp/cesium/raw/master/install.sh | bash

export VERSION=`sed -rn "s/\s*\"version\": \"([^\"]*)\",\s*/\1/p" cesium/config.js`
export BUILD=`sed -rn "s/\s*\"build\": \"([^\"]*)\",\s*/\1/p" cesium/config.js`
echo "Detected version: $VERSION"
echo "           build: $BUILD"

if [ -e "$BASEDIR/config.js" ]; then
  echo "Override config file using '$BASEDIR/config.js'"
  cp -f cesium/config.js cesium/config.js.ori
  cp -f config.js cesium/
  
  # Keep version and build from original config file
  sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"${VERSION}\"/g" cesium/config.js
  sed -i "s/\"build\": \"[^\"]*\"/\"build\": \"${BUILD}\"/g" cesium/config.js
fi

echo "Done !"
```