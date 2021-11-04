
# Deploy Cesium on a web server 

> **WARN**: Installing Cesium as a web site is NOT recommended, for security reasons!
> A DNS attack can redirect to another web site (with modified javascript code) in order to retrieve user credentials (wallet secret key)
>
> We recommend the use of the [web extension](build_web_extension.md), or the [desktop application](build_desktop.md);
>
> Read [this post](https://forum.monnaie-libre.fr/t/cesium-evolue-aie-ca-va-piquer-mais/10015) for details (French).

## First deployment

1. Download the [latest release](https://github.com/duniter/cesium/releases/latest) (file `cesium-vx.y.z-web.zip`);
 
2. Unpack into an empty directory;

3. Change Cesium default settings, by editing the file `config.js` (see next bottom); 

4. Configure the web server engine (e.g. Apache, nginx):
  * Add a new `location` (or a new `virtual host`), that use the directory as `web root`. 
  * Make sure the file `index.html` exist inside this directory.
 
   Please refer to your engine documentation.

5. Restart your web engine.

That's it !


## Configure Cesium default settings 

To change default configuration, that Cesium will use:

- Edit the file `config.js` in the web root directory, and change some properties:
  
```js
angular.module("cesium.config", [])
.constant("csConfig", {
  "fallbackLanguage": "en",
  "rememberMe": false,
  "timeWarningExpireMembership": 5184000,
  "timeWarningExpire": 7776000,
  "useLocalStorage": true,
  "useRelative": true,
  "decimalCount": 4,
  "helptip": {
    "enable": true,
    "installDocUrl": "https://github.com/duniter/duniter/blob/master/doc/install-a-node.md"
  },
  "node": {
    "host": "g1.duniter.org",
    "port": "443"
  },
	"plugins": {
		"es": {
			"enable": "true",
			"host": "g1.data.duniter.fr",
			"port": "443"
		}
	},
	"version": "1.3.7",
	"build": "2019-04-02T08:27:57.915Z"
});
```

- Configure a Duniter node:
  * set `node.host` and `node.port` to the default node address. 

- Configure the optional extension for [Cesium+](https://git.duniter.org/clients/cesium-grp/cesium-plus-pod/)

  * set `plugins.es.host` and `plugins.es.port` to the default Cesium+ Pod (aka ES) address.
  * set `plugins.es.enable` with [true|false] to change the default extension state. 
   
   
To learn more about configuration options, see the [detailed documentation](configuration.md).

 
## Update to the last version

On Linux server, you can use an update script:

```
cd <CESIUM_WEB_ROOT>
curl -kL https://git.duniter.org/clients/cesium-grp/cesium/raw/master/install.sh | bash
```
or:

```
cd <CESIUM_WEB_ROOT>
wget -qO- https://git.duniter.org/clients/cesium-grp/cesium/raw/master/install.sh | bash
```

> **Note**: You should NOT need root permission. Make sure to NEVER replace `| bash` by `| sudo bash`!
> For any permission issue during installation, change permission on directory, then retry.

## Another Bash script  
 
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