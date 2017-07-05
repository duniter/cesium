/******
* !! WARNING: This is a generated file !!
*
* PLEASE DO NOT MODIFY DIRECTLY
*
* => Changes should be done on file 'app/config.json'.
******/

angular.module("cesium.config", [])

.constant("csConfig", {
	"cacheTimeMs": 300000,
	"fallbackLanguage": "en",
	"rememberMe": false,
	"showUDHistory": false,
	"timeout": 300000,
	"timeWarningExpireMembership": 5184000,
	"timeWarningExpire": 7776000,
	"useLocalStorage": true,
	"useRelative": false,
	"expertMode": true,
	"decimalCount": 2,
	"helptip": {
		"enable": true,
		"installDocUrl": "https://github.com/duniter/duniter/blob/master/doc/install-a-node.md"
	},
	"node": {
		"host": "g1-test.duniter.org",
		"port": 443
	},
	"fallbackNodes": [
		{
			"host": "g1-test.cgeek.fr",
			"port": 443
		}
	],
	"plugins": {
		"es": {
			"enable": true,
			"askEnable": false,
			"host": "g1-test.data.duniter.fr",
			"port": 443,
			"notifications": {
				"txSent": true,
				"txReceived": true,
				"certSent": true,
				"certReceived": true
			}
		}
	},
	"version": "0.13.0",
	"build": "2017-07-04T17:40:16.967Z",
	"newIssueUrl": "https://github.com/duniter/cesium/issues/new?labels=bug"
})

;