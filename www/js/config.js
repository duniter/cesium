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
		"host": "duniter.le-sou.org",
		"port": "9600"
	},
	"plugins": {
		"es": {
			"enable": true,
			"askEnable": false,
			"host": "localhost",
			"port": "9200"
		}
	},
	"version": "0.5.1",
	"build": "2016-11-30T09:19:40.409Z",
	"newIssueUrl": "https://github.com/duniter/cesium/issues/new?labels=bug"
})

;