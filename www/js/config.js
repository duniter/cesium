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
	"expertMode": false,
	"decimalCount": 2,
	"helptip": {
		"enable": true,
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
			"askEnable": true,
			"host": "data.le-sou.org",
			"port": "80"
		}
	},
	"version": "0.4.8",
	"build": "2016-11-09T19:19:30.566Z",
	"newIssueUrl": "https://github.com/duniter/cesium/issues/new?labels=bug"
})

;
