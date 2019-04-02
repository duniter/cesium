![Cesium logo](https://github.com/duniter/cesium/raw/master/www/img/logo_144px.png)

# Cesium

 - [Unhosted webapp](https://unhosted.org) client for any [Duniter](https://duniter.org) crypto-currency.
 - Manage your wallet, certify your friends, and more ! 
 - [Web site](https://cesium.app)

## Install

### On desktop computer

 - Download the [latest release](https://github.com/duniter/cesium/releases/latest)
 
 - Then install, depending on your operating system:  
    * Ubuntu: Double click the `.deb` file
    * Debian: Run the command `sudo dpkg -i *.deb`
    * Windows: Double click on the `.exe` file
    * Mac OSx: Unzip the osx `.zip` file, then drop Cesium into your `Applications` folder 
    * Other operating systems:  
       * Unpack the ZIP archive (file `cesium-vX.Y.Z-web.zip`) into an empty folder;
       * Open the file `index.html` in your web browser;

### On smartphone

 - Android: 
    * Manual installation: download then install the `.apk` from your smartphone;
    * [Play Store](https://play.google.com/store/apps/details?id=fr.duniter.cesium);
 - iOS
    * Coming soon...;

### As a web site

#### First installation

Cesium can be easily installed on most web server : 

 - Download the [latest release](https://github.com/duniter/cesium/releases/latest) (file `cesium-vx.y.z-web.zip`); 
 - Unpack into an empty directory;
 - Configure the web server engine (e.g. apache, nginx):
    * Add a new virtual host, that use the directory as `web root`. 
    * Make sure the file `index.html` exist inside this directory.

#### Update to last version

On Linux distributions, an update script can be used to update your Cesium web site:

```
cd <CESIUM_WEB_ROOT>
curl -kL https://git.duniter.org/clients/cesium-grp/cesium/raw/master/install.sh | bash
```
or:

```
cd <CESIUM_WEB_ROOT>
wget -qO- https://git.duniter.org/clients/cesium-grp/cesium/raw/master/install.sh | bash
```


**Note**: You may need root permission to write files. If so just replace `| bash` with `| sudo bash`.

#### Changing default settings 

To change default configuration, on a Cesium web site:

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
   
To learn more about configuration options, see the [detailed documentation](doc/configuration.md).
 
#### Yunohost package
    
There is a [package](https://github.com/duniter/cesium_ynh) for [YunoHost self-hosting distribution](https://yunohost.org).

## Contribute

A [Development Guide](doc/development_guide.md) is available to learn :
 - How to install your development environment.
 - Development best practices.
 
A [development tutorial](doc/fr/development_tutorial-01.md) (in French) is also available.

## Donate

To help developers with donation, use the [Cesium Team Ğ1 account](https://g1.duniter.fr#/app/wot/CitdnuQgZ45tNFCagay7Wh12gwwHM8VLej1sWmfHWnQX/) (public key: `CitdnuQgZ45tNFCagay7Wh12gwwHM8VLej1sWmfHWnQX`) 

## License

This software is distributed under [GNU AGPL-3.0](https://raw.github.com/duniter/cesium/master/LICENSE).