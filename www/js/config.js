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
	"fallbackLanguage": "fr-FR",
	"defaultLanguage": "fr-FR",
	"rememberMe": true,
	"timeout": 30000,
	"timeWarningExpireMembership": 5184000,
	"timeWarningExpire": 7776000,
	"keepAuthIlde": 600,
	"useLocalStorage": true,
	"useRelative": false,
	"expertMode": false,
	"decimalCount": 2,
	"httpsMode": false,
	"shareBaseUrl": "https://g1.le-sou.org",
	"helptip": {
		"enable": true,
		"installDocUrl": {
			"fr-FR": "https://www.le-sou.org/devenir-noeud/",
			"en": "https://duniter.org/en/wiki/duniter/install/"
		}
	},
	"license": {
		"fr-FR": "license/license_g1-fr-FR",
		"en": "license/license_g1-en"
	},
	"node": {
		"host": "g1.le-sou.org",
		"port": "443"
	},
	"fallbackNodes": [
		{
			"host": "g1.duniter.org",
			"port": "443"
		},
		{
			"host": "g1.duniter.fr",
			"port": "443"
		},
		{
			"host": "g1.le-sou.org",
			"port": "443"
		}
	],
	"plugins": {
		"es": {
			"enable": true,
			"askEnable": false,
			"host": "g1.data.le-sou.org",
			"port": "443",
			"notifications": {
				"txSent": true,
				"txReceived": true,
				"certSent": true,
				"certReceived": true
			},
			"defaultCountry": "France"
		}
	},
	"version": "0.17.6",
	"build": "2017-10-03T21:22:44.315Z",
	"newIssueUrl": "https://github.com/duniter/cesium/issues/new?labels=bug"
})

;