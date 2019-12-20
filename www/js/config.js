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
			"askEnable": true,
			"useRemoteStorage": true,
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
	"version": "1.4.12",
	"build": "2019-12-19T14:53:37.759Z",
	"newIssueUrl": "https://git.duniter.org/clients/cesium-grp/cesium/issues/new"
})

;