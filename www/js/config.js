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
	"initPhase": false,
	"expertMode": true,
	"helptip": {
		"enable": false,
		"installDocUrl": {
			"fr-FR": "http://www.le-sou.org/devenir-noeud/",
			"en": "https://github.com/duniter/duniter/blob/master/doc/install-a-node.md"
		}
	},
	"node": {
		"host": "192.168.0.28",
		"port": 21378
	},
	"plugins": {
		"es": {
			"enable": true,
			"askEnable": false,
			"host": "localhost",
			"port": 9200,
			"wsPort": 9400,
			"notifications": {
				"txReceived": true,
        "txSent": false
			}
		}
	},
<<<<<<< HEAD
	"version": "0.5.1",
	"build": "2016-12-08T17:20:54.422Z",
=======
	"version": "0.5.2",
	"build": "2016-11-19T12:56:03.326Z",
>>>>>>> origin/master
	"newIssueUrl": "https://github.com/duniter/cesium/issues/new?labels=bug"
})

;
