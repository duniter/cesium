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
	"timeout": 30000,
	"timeWarningExpireMembership": 5184000,
	"timeWarningExpire": 7776000,
	"minConsensusPeerCount": -1,
	"useLocalStorage": true,
	"useRelative": false,
	"expertMode": true,
	"decimalCount": 2,
	"httpsMode": false,
	"shareBaseUrl": "https://g1-test.cesium.app",
	"helptip": {
		"enable": false,
		"installDocUrl": {
			"fr-FR": "https://duniter.fr/wiki/doc/installer/",
			"en": "https://duniter.org/wiki/doc/install/"
		}
	},
	"node": {
		"host": "g1-test.duniter.org",
		"port": 443
	},
	"fallbackNodes": [
		{
			"host": "gt.moul.re",
			"port": 10902
		},
		{
			"host": "g1-test.duniter.org",
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
			"enable": false,
			"askEnable": false,
			"useRemoteStorage": false,
			"host": "g1-test.data.e-is.pro",
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
	"version": "1.7.13",
	"build": "2024-01-03T17:45:14.686Z",
	"newIssueUrl": "https://git.duniter.org/clients/cesium-grp/cesium/issues/new"
})

;