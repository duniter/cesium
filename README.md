![Cesium logo](https://github.com/duniter/cesium/raw/master/www/img/logo_144px.png)

# Cesium

[Unhosted webapp](https://unhosted.org) client for any [Duniter](https://duniter.org) crypto-currency.

Manage your wallet, certify your friends, and more ! 


## Try it !

 - on Ğ1-test currency: https://g1-test.duniter.fr
 - on Ğ1 currency (production use): https://g1.duniter.fr


## Installation

### On a desktop computer
 
 To use Cesium from your desktop computer :
 
 - Debian or Windows: 
    * Download the [latest release](https://github.com/duniter/cesium/releases/latest).
    * Choose the desktop packaging (`cesium-desktop-vX.Y.Z-*`)
    * Execute the downloaded file, and follow installation steps;
 - Other operating systems: 
    * Choose the web packaging (`cesium-vX.Y.Z-web.zip`);
    * Unpack the archive into a empty folder;
    * Open the file `index.html` in your web browser;

### On a Yunohost installation

There is a [package](https://github.com/duniter/cesium_ynh) for [YunoHost self-hosting distribution](https://yunohost.org).

### On a web server

#### Installation

Cesium can be easily installed on most web server : 

 - Download the [latest release](https://github.com/duniter/cesium/releases/latest). Choose the web packaging (`cesium-vX.Y.Z-web.zip`); 
 - Unpack in a empty directory;
 - Configure a virtual host, to use previous directory as root. Check the file `index.html` exist in the root directory.

For Linux distribution, a installation script could also be used to:

 - Download the [latest release](https://github.com/duniter/cesium/releases/latest)
 - Unpack archive into the directory `./cesium`. Existing files will be override.  

```
curl -kL https://git.duniter.org/clients/cesium-grp/cesium/raw/master/install.sh | bash
```
or:

```
wget -qO- https://git.duniter.org/clients/cesium-grp/cesium/raw/master/install.sh | bash
```


**Note**: You may need root permission to write files. If so just replace `| bash` with `| sudo bash`.

#### Configuration

To change default configuration, on a web server installation:

  - Edit the file `config.js`, and set default properties:
  
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
    "host": "gtest.duniter.org",
    "port": "10900"
  },
	"plugins": {
		"es": {
			"enable": "false",
			"host": "data.gtest.duniter.fr",
			"port": "80"
		}
	},
	"version": "0.9.7",
	"build": "2017-01-17T08:27:57.915Z"
});
```

  - Configure a Duniter node:
 
     * set `node.host` and `node.port` to the default node address. 
   
  - Configure the optional extension for [ElasticSearch Duniter4j node](https://github.com/duniter/duniter4j)
 
     * set `plugins.es.host` and `plugins.es.port` to the default ES node address.
   
     * set `plugins.es.enable` with [true|false] to change the default extension state. 
   
To learn more about configuration options, see the [detailed documentation](doc/configuration.md).
 
## Developement

Wants to compile Cesium ? or contribute ?

A [Development Guide](doc/development_guide.md) is available to learn :
 - How to install your development environment.
 - Development best practices.
 
A [development tutorial](doc/fr/development_tutorial-01.md) (in French) is also available.

## License

This software is distributed under [GNU AGPL-3.0](https://raw.github.com/duniter/cesium/master/LICENSE).

## Troubleshooting

#### I'm having errors on Ubuntu/Debian (desktop version)

Install these dependencies:

```
sudo apt-get install -y libgconf-2-4
```