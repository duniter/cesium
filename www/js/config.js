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
	"fallbackLanguage": "fr-FR",
	"defaultLanguage": "fr-FR",
	"rememberMe": true,
	"showUDHistory": false,
	"timeout": 6000,
	"timeWarningExpireMembership": 5184000,
	"timeWarningExpire": 7776000,
	"useLocalStorage": true,
	"useRelative": true,
	"expertMode": true,
	"decimalCount": 2,
	"helptip": {
		"enable": false,
		"installDocUrl": {
			"fr-FR": "http://www.le-sou.org/devenir-noeud/",
			"en": "https://github.com/duniter/duniter/blob/master/doc/install-a-node.md"
		}
	},
	"license": {
		"fr-FR": "license/license_g1-fr-FR.txt",
		"en": "license/license_g1-en.txt"
	},
  "node": {
    "host": "g1.duniter.fr",
    "port": "443"
  },
	"plugins": {
		"es": {
			"enable": false,
			"askEnable": false,
			"host": "localhost",
			"port": 9200,
			"wsPort": 9400,
			"notifications": {
				"txSent": true,
				"txReceived": true,
				"certSent": true,
				"certReceived": true
			}
		},
		"graph": {
			"enable": true
		},
		"neo4j": {
			"enable": true
		},
    // Activation du plugin RML9
		"rml9": {
			"enable": true
		}
	},
	"version": "0.12.6",
	"build": "2017-05-30T09:15:49.818Z",
	"newIssueUrl": "https://github.com/duniter/cesium/issues/new?labels=bug"
})

;
