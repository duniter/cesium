
# Deploy Cesium on a web server 

> **WARN**: Installing Cesium as a web site is NOT recommended, for security reasons!
> A DNS attack can redirect to another web site (with modified javascript code) in order to retrieve user credentials (wallet secret key)
>
> We recommend the use of the [web extension](build_web_extension.md), or the [desktop application](build_desktop.md);
>
> Read [this post](https://forum.monnaie-libre.fr/t/cesium-evolue-aie-ca-va-piquer-mais/10015) for details (French).

## First deployment

1. Create the root directory:
    ```bash
      cd /var/www/
      sudo mkdir cesium
      cd cesium 
    ```

2. Download and unzip:
    ```bash
      cd /var/www/cesium
      wget -kL https://.../cesiumvx.y.z.zip
      unzip -o /var/www/cesium cesiumvx.y.z.zip
    ```

3. Configure Cesium default settings, by editing the file `config.js`; 

4. Configure your web engine (e.g. Apache, nginx) to use the root directory, by creating a new `location` or a new `virtualhost`;

   Please refer to your engine documentation.

5. Restart your web engine.

That's it !

## Update to the latest version

## Example Bash script 
 
This is a bash script example, that you can use to deploy the latest release, in a existing Cesium web site.

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

# In order to get the latest version, simplify run:
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