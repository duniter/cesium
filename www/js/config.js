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
	"showUDHistory": true,
	"timeout": 40000,
	"timeWarningExpireMembership": 5184000,
	"timeWarningExpire": 7776000,
	"keepAuthIdle": 600,
	"useLocalStorage": true,
	"useRelative": false,
	"expertMode": false,
	"decimalCount": 2,
	"httpsMode": false,
	"shareBaseUrl": "https://g1.duniter.fr",
	"helptip": {
		"enable": true,
		"installDocUrl": {
			"fr-FR": "https://duniter.org/fr/wiki/duniter/installer/",
			"en": "https://duniter.org/en/wiki/duniter/install/"
		}
	},
	"license": {
		"en": "license/license_g1-en",
		"fr-FR": "license/license_g1-fr-FR",
		"es-ES": "license/license_g1-es-ES",
		"eo-EO": "license/license_g1-eo-EO"
	},
	"feed": {
		"jsonFeed": {
			"fr-FR": "https://raw.githubusercontent.com/duniter/cesium/master/doc/feed/feed-fr.json",
			"en": "https://raw.githubusercontent.com/duniter/cesium/master/doc/feed/feed-en.json"
		},
		"maxContentLength": 1300
	},
	"node": {
		"host": "g1.duniter.org",
		"port": 443
	},
	"fallbackNodes": [
		{
			"host": "g1.cgeek.fr",
			"port": 443
		},
		{
			"host": "g1.monnaielibreoccitanie.org",
			"port": 443
		},
		{
			"host": "g1.le-sou.org",
			"port": 443
		},
		{
			"host": "g1.duniter.fr",
			"port": 443
		}
	],
	"developers": [
		{
			"name": "Benoit Lavenier",
			"pubkey": "38MEAZN68Pz1DTvT3tqgxx4yQP6snJCQhPqEFxbDk4aE"
		}
	],
	"plugins": {
		"es": {
			"enable": true,
			"askEnable": true,
			"useRemoteStorage": true,
			"host": "g1.data.duniter.fr",
			"port": 443,
			"fallbackNodes": [
				{
					"host": "g1.data.le-sou.org",
					"port": 443
				},
				{
					"host": "g1.data.duniter.fr",
					"port": 443
				}
			],
			"notifications": {
				"txSent": true,
				"txReceived": true,
				"certSent": true,
				"certReceived": true
			},
			"defaultCountry": "France"
		}
	},
	"version": "1.5.11",
	"build": "2020-03-13T17:20:00.591Z",
	"newIssueUrl": "https://git.duniter.org/clients/cesium-grp/cesium/issues/new"
})

;