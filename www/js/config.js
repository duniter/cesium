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
	"helptip": {
		"enable": false
	},
	"node": {
		"host": "192.168.0.28",
		"port": "9604"
	},
	"plugins": {
		"es": {
			"enable": true,
			"host": "data.duniter.fr",
			"port": "80"
		}
	},
	"version": "0.3.16",
	"build": "2016-10-14T21:21:43.099Z",
	"newIssueUrl": "https://github.com/duniter/cesium/issues/new?labels=bug"
})

;