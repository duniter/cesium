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
	"demo": false,
	"readonly": false,
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
	"shareBaseUrl": "https://demo.cesium.app/",
	"helptip": {
		"enable": true,
		"installDocUrl": {
			"fr-FR": "https://duniter.fr/wiki/doc/installer/",
			"en": "https://duniter.org/wiki/doc/install/"
		}
	},
	"license": {
		"ca": "license/license_g1-ca",
		"de-DE": "license/license_g1-de-DE",
		"en": "license/license_g1-en",
		"en-GB": "license/license_g1-en",
		"eo-EO": "license/license_g1-eo-EO",
		"es-ES": "license/license_g1-es-ES",
		"fr-FR": "license/license_g1-fr-FR",
		"it-IT": "license/license_g1-it-IT",
		"pt-PT": "license/license_g1-pt-PT"
	},
	"feed": {
		"jsonFeed": {
			"ca": "https://raw.githubusercontent.com/duniter/cesium/master/doc/feed/1.1/feed-ca.json",
			"de-DE": "https://raw.githubusercontent.com/duniter/cesium/master/doc/feed/1.1/feed-de-DE.json",
			"en": "https://raw.githubusercontent.com/duniter/cesium/master/doc/feed/draft/feed-en.json",
			"en-GB": "https://raw.githubusercontent.com/duniter/cesium/master/doc/feed/1.1/feed-en-GB.json",
			"eo-EO": "https://raw.githubusercontent.com/duniter/cesium/master/doc/feed/1.1/feed-eo-EO.json",
			"es-ES": "https://raw.githubusercontent.com/duniter/cesium/master/doc/feed/draft/feed-es.json",
			"fr-FR": "https://raw.githubusercontent.com/duniter/cesium/master/doc/feed/draft/feed-fr.json",
			"it-IT": "https://raw.githubusercontent.com/duniter/cesium/master/doc/feed/1.1/feed-it-IT.json",
			"nl-NL": "https://raw.githubusercontent.com/duniter/cesium/master/doc/feed/1.1/feed-nl-NL.json",
			"pt-PT": "https://raw.githubusercontent.com/duniter/cesium/master/doc/feed/1.1/feed-pt-PT.json"
		},
		"maxContentLength": 1300,
		"maxAgeInMonths": 3,
		"maxCount": 3
	},
	"fallbackNodes": [
		{
			"host": "g1.e-is.pro",
			"port": 443
		},
		{
			"host": "vit.fdn.org",
			"port": 443
		},
		{
			"host": "g1.cgeek.fr",
			"port": 443
		},
		{
			"host": "g1.mithril.re",
			"port": 443
		},
		{
			"host": "g1.duniter.org",
			"port": 443
		},
		{
			"host": "g1.le-sou.org",
			"port": 443
		}
	],
	"developers": [
		{
			"name": "Benoit Lavenier",
			"pubkey": "38MEAZN68Pz1DTvT3tqgxx4yQP6snJCQhPqEFxbDk4aE"
		},
		{
			"name": "Cédric Moreau",
			"pubkey": "2ny7YAdmzReQxAayyJZsyVYwYhVyax2thKcGknmQy5nQ"
		},
		{
			"name": "Kapis",
			"pubkey": "24jaf8XhYZyDyUb7hMcy5qsanaHBC11AwPefcCQRBQNA"
		},
		{
			"name": "Matograine",
			"pubkey": "CmFKubyqbmJWbhyH2eEPVSSs4H4NeXGDfrETzEnRFtPd"
		}
	],
	"plugins": {
		"es": {
			"enable": true,
			"askEnable": true,
			"useRemoteStorage": true,
			"host": "g1.data.e-is.pro",
			"port": 443,
			"fallbackNodes": [
				{
					"host": "g1.data.presles.fr",
					"port": 443
				},
				{
					"host": "g1.data.le-sou.org",
					"port": 443
				},
				{
					"host": "g1.data.brussels.ovh",
					"port": 443
				},
				{
					"host": "g1.data.pini.fr",
					"port": 443
				},
				{
					"host": "g1.data.mithril.re",
					"port": 443
				},
				{
					"host": "g1.data.e-is.pro",
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
	"version": "1.7.7",
	"build": "2023-08-14T17:05:16.324Z",
	"newIssueUrl": "https://git.duniter.org/clients/cesium-grp/cesium/issues/new"
})

;
