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
  "useRelative": false,
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

## Minimal configuration file

Because of default options values (see details below), the minimal configuration file should be:

- without any extension:
  ```js
  angular.module("cesium.config", [])
  .constant("csConfig", {
  	"node": {
  		"host": "gtest.duniter.fr",
  		"port": "10900"
  	},
  	"version": "0.9.18",
  	"build": "2017-01-31T14:19:31.296Z"
  });
  ```

- with ES (Cesium+) extension:
  ```js
    angular.module("cesium.config", [])
    .constant("csConfig", {
    	"node": {
    		"host": "gtest.duniter.fr",
    		"port": "10900"
    	},
    	"plugins": {
    	   "es": {
           "host": "data.gtest.duniter.fr",
           "port": "80"
         }
      },
    	"version": "0.9.18",
    	"build": "2017-01-31T14:19:31.296Z"
    });
    ```
  
## Core options

### Technical and mandatory options 

This technical options are mandatory in the configuration file. User can NOT changed them.

Option                      | Description
--------------------------- | -------------------------------------------
version                     | Build version. Filled at compilation time.
build                       | Build date. Filled at compilation time.


### Technical and optional options 

This technical options are optional (default values will be applied if not set). User can NOT changed them.

Option                      | Description                                                                                    | Default value
--------------------------- | ---------------------------------------------------------------------------------------------- | -----------------
cacheTimeMs                 | Default network request cache time, in millisecond.                                            | `60000` (1 min).
fallbackLanguage            | Default locale, if browser default language not exists in Cesium                               | `en`
defaultLanguage             | Used to force the default language (ignore browser's language), on user first connection.      | =`fallbackLanguage`
decimalCount                | Number of decimal to display, on float value (when using relative unit)                        | `4`
helptip.installDocUrl       | Used in features tour, for the link 'How-to install my own node'.                              | URL of [Duniter installation node](https://github.com/duniter/duniter/blob/master/doc/install-a-node.md)
initPhase                   | Enable a special mode, used when currency is NOT initialized (block #0 not written)            | `false`
newIssueUrl                 | Used for link in the About screen, to submit new issue                                         | URL of [Cesium issues on GitHub](https://github.com/duniter/cesium/issues/new?labels=bug)
timeout                     | Default network request timeout, in millisecond.                                               | `4000`
timeWarningExpire           | Delay (in second) before expiration of certifications, use to warn the user that there will soon be a lack of certifications | `5184000` (2 mois)
timeWarningExpireMembership | Delay (in second) before membership expiration, use to warns user that he should renew his membership.  | `7776000` (3 mois)
walletHistoryTimeSecond     | Default transaction history to load (in second), in 'My account' screen.                       | `86400` (30 days) 
walletHistorySliceSecond    | Slice size (in second) for downloading transaction history (need for cache optimization)       | `432000` (5 days)
wallet.alertIfUnusedWallet  | Should warn user if account seems to be used ?                                                 | `true`

> This default values are defined in [this code](../www/js/services/settings-services.js#L44)


### User options

This options can be changed by user action (generally using Settings screen, or action buttons).


Options                     | Description                                                                        | Default value
--------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------
expertMode                  | Enable the expert mode (display more technical details)                            | `false`
helptip.enable              | Should open help tips (contextual tips) ?                                          | `true`
node.host                   | Duniter peer host to use by default (DNS name or IP)                               | defined in `config.js` file
node.port                   | Duniter peer port to use by default                                                | defined in `config.js` file
rememberMe                  | Default value of the 'Remember me' button, in the login popup                      | `true` if Android  build, `false` if not
showUDHistory               | Should display UD history in the transaction history ?                             | `false`
showLoginSalt               | Should display salt value (pass phrase) in the login screen. If `false`, masked.   | `false`
useLocalStorage             | Enable data storage (settings, credentials, cache) in the browser local storage ?  | `true`
useRelative                 | Should use relative unit (UD) by default ?                                         | `false`
wallet.showPubkey           | Should display pubkey and uid in 'My account' screen ?                             | `true`
wallet.notificationReadTime | Time (in second) since the last notification read.                                 | `0` (never read)


## Plugin options

### ES API (for Cesium +)

This options should be defined in `config.js`, to enable Cesium+ extension.
Then user can change this default values (generally using the Settings screen).

Options                     | Description
--------------------------- | -------------------------------------------- 
plugins.es.enable           | Enable or not Cesium+ extension, by default.
plugins.es.host             | Default ES node host (DNS name or IP)
plugins.es.port             | Default ES node port


> To **remove** the extension (and not only disable by default): remove all content inside the `plugins` attribute.
> Users will NOT be able to enable the extension.
