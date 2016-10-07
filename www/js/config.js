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
	"node": {
		"host": "192.168.0.5",
		"port": "9602"
	},
	"plugins": {
		"es": {
			"enable": false,
			"host": "192.168.0.5",
			"port": "9203"
		}
	},
	"version": "0.3.15",
	"build": "2016-10-07T12:16:48.801Z",
	"newIssueUrl": "https://github.com/duniter/cesium/issues/new?labels=bug"
})

;