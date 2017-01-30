![Cesium logo](https://github.com/duniter/cesium/raw/master/www/img/logo_144px.png)

# Cesium

[Unhosted webapp](https://unhosted.org) client for [Duniter](https://duniter.org) network.

Try it at: http://cesium.duniter.fr


## Installation

### On desktop computer
 
 To use Cesium from your desktop computer :
 
 - Download the [latest release](https://github.com/duniter/cesium/releases/latest). Choose the web packaging (`cesium-vX.Y.Z-we.zip`); 
 - Unpack in a empty directory;
 - Open the `index.html` file in a web browser.

### On web server

Cesium can be easily installed on most web server.

#### Minimal install from source
If you don't already use nodejs (v5), please follow [prerequisite steps](https://github.com/duniter/cesium#prerequisite).
```bash
git clone https://github.com/duniter/cesium.git
cd cesium
npm install
npm start
```
Answer asked questions.

Your cesium instance is now reacheable on : [http://localhost:8100/](http://localhost:8100/) or an other ip if your listen on an other interface.

#### Installation script

For Linux distribution, a installation script could be used to:

 - Download the [latest release](https://github.com/duniter/cesium/releases/latest)
 - Unpack archive into the directory `./cesium`. Existing files will be override.  

```
curl -kL https://raw.githubusercontent.com/duniter/cesium/master/install.sh | bash
```
or:

```
wget -qO- https://raw.githubusercontent.com/duniter/cesium/master/install.sh | bash
```


**Note**: You may need root permission to write files. If so just replace `| bash` with `| sudo bash`.


#### Yunohost package

There is a [package](https://github.com/duniter/cesium_ynh) for [YunoHost self-hosting distribution](https://yunohost.org).

## Configuration

To change default configuration:

  - Edit the file `config.js`, and set default properties:
  
```js
angular.module("cesium.config", [])
.constant("csConfig", {
  "cacheTimeMs": 60000,
  "fallbackLanguage": "en",
  "rememberMe": false,
  "showUDHistory": false,
  "timeout": 10000,
  "timeWarningExpireMembership": 5184000,
  "timeWarningExpire": 7776000,
  "useLocalStorage": true,
  "useRelative": true,
  "initPhase": false,
  "expertMode": false,
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
			"port": "9203"
		}
	},
	"version": "0.9.7",
	"build": "2017-01-17T08:27:57.915Z",
	"newIssueUrl": "https://github.com/duniter/cesium/issues/new?labels=bug"
});
```

  - Configure a Duniter node:
 
     * set `node.host` and `node.port` to the default node address. 
   
  - Configure the optional extension for [ElasticSearch Duniter4j node](https://github.com/duniter/duniter4j)
 
     * set `plugins.es.host` and `plugins.es.port` to the default ES node address.
   
     * set `plugins.es.enable` with [true|false] to change the default extension state. 
   
     * To **remove** the extension (and not only disable by default): remove all content inside the `plugins` tag.
       Users will NOT be able to enable the extension.
 
## License

This software is distributed under [GNU GPLv3](https://raw.github.com/duniter/cesium/master/LICENSE).

## Development Guide

### Prerequisite  

To build Cesium, you will have to: 
 
  - Installing [nvm](https://github.com/creationix/nvm)
```
  wget -qO- https://raw.githubusercontent.com/creationix/nvm/v0.31.0/install.sh | bash
```

  - Configure NodeJS to use a version 5:
```
  nvm install 5 
```
      
  - Installing nodejs build tools:
```
   npm install -g bower gulp ionic@1.7.16 cordova
```

  - Installing other build dependencies:
```
 sudo apt-get install build-essential
```
   
### Source code
   
  - Getting source and installing project dependencies:    
```
  git clone https://github.com/duniter/cesium.git
  cd cesium
  npm install
  bower install
```
  - Installing Cordova plugins    
```
  ionic state restore
```

### Build environment

 - To configure your build environment :
 
    * Add your environment config into `app/config.json`
   
    * Update default configuration, using the command:
    
```
  gulp config --env <your_env_name> 
```

 This will update the configuration file used by cesium, at `www/js/config.json`.
 
### Compile and launch

  - Compiling and running Cesium:
```
  npm start
```
or 
```
  ionic serve
```

### Best pratices

 Cesium could be run on phone devices. Please read [performance tips on AgularJS + Ionic ](http://julienrenaux.fr/2015/08/24/ultimate-angularjs-and-ionic-performance-cheat-sheet/)
 before starting to contribute.
 Read also [Angular performance for large applicatoins](https://www.airpair.com/angularjs/posts/angularjs-performance-large-applications). 
