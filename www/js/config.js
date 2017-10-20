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
	"rememberMe": true,
	"timeout": 300000,
	"timeWarningExpireMembership": 5184000,
	"timeWarningExpire": 7776000,
	"useLocalStorage": true,
	"useRelative": false,
	"expertMode": true,
	"decimalCount": 2,
	"shareBaseUrl": "https://g1.duniter.fr",
	"helptip": {
		"enable": false,
		"installDocUrl": {
			"fr-FR": "https://duniter.org/fr/wiki/duniter/installer/",
			"en": "https://github.com/duniter/duniter/blob/master/doc/install-a-node.md"
		}
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
			},
			"defaultCountry": "France"
		}
	},
	"version": "0.18.2",
	"build": "2017-10-20T16:07:02.760Z",
	"newIssueUrl": "https://github.com/duniter/cesium/issues/new?labels=bug"
})

;