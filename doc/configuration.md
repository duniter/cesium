![Cesium logo](https://github.com/duniter/cesium/raw/master/www/img/logo_144px.png)

# Configuration

On a web server or local installation, Cesium use a configuration to set default settings, like default peer, timeout, ...
   
## Deployment configuration

When deploying Cesium (on web server or locally for a standalone use), you need to change this default configuration :

- Edit the file `config.js`:  
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
			"port": "80"
		}
	},
	"version": "...",
	"build": "...",
	"newIssueUrl": "https://github.com/duniter/cesium/issues/new?labels=bug"
});
```

- Change options value, sucha as: 

    * Default Duniter node: set `node.host` and `node.port` to the default node address. 
   
    * Default ES node ([ElasticSearch Duniter4j node](https://github.com/duniter/duniter4j)), used for Cesium+ extension 
 
         * set `plugins.es.enable` with [true|false] to change the default extension state.
      
         * set `plugins.es.host` and `plugins.es.port` to the default ES node address.
      
         > To **remove** the extension (and not only disable by default): remove all content inside the `plugins` tag.
         > Users will NOT be able to enable the extension.

       
## Basic configuration options


Options                     | Description
--------------------------- | ------------------------------------------------------------------------------------------------------------------------------
cacheTimeMs                 | Default network request cache time, in millisecond.
fallbackLanguage            | Default locale, if browser default language not exists in Cesium (Optional, default to 'en')
defaultLanguage             | Used to force the default language (ignore browser's language), on user first connection (Optional) 
rememberMe                  | Default value of the 'Remember me' button, in the login popup (*)
timeout                     | Default network request timeout, in millisecond
timeWarningExpireMembership | Delay (in second) before membership expiration, use to warns user that he should renew his membership. 
timeWarningExpire           | Delay (in seconds) before expiration of certifications, use to warn the user that there will soon be a lack of certifications 
useLocalStorage             | Enable data storage (settings, credentials, cache) in the browser local storage ?
useRelative                 | Should user relative unit by default ? (*)
helptip.enable              | Should enable help tip be default ? (*)
helptip.installDocUrl       | Used in features tour, for the link 'How-to install my own node' 
node.host                   | Duniter peer host to use by default (DNS name or IP) (*)
node.port                   | Duniter peer port to use by default (*)
version                     | Build version. Filled at compilation time.
build                       | Build date. Filled at compilation time.
newIssueUrl                 | Used for link in the About screen, to submit new issue


(*) User is able to change this value (generally using the Settings screen).


## Extension configuration options


Options                     | Description
--------------------------- | -------------------------------------------------
plugins.es.enable           | Should enable Cesium+ extension by default ? (*)
plugins.es.host             | Default ES node host (DNS name or IP) (*)
plugins.es.port             | Default ES node port (*)


(*) User is able to change this value (generally using the Settings screen).