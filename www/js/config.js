/******
* !! WARNING: This is a generated file !!
*
* PLEASE DO NOT MODIFY DIRECTLY
*
* => Changes should be done on file 'app/config.json'.
******/

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
	"httpsMode": false,
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
			"enable": true,
			"askEnable": false,
			"host": "data.gtest.duniter.fr",
			"port": "80",
			"notifications": {
				"txSent": true,
				"txReceived": true,
				"certSent": true,
				"certReceived": true
			}
		}
	},
	"version": "0.9.33",
	"build": "2017-02-17T10:13:50.778Z",
	"newIssueUrl": "https://github.com/duniter/cesium/issues/new?labels=bug"
})

;