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
	"fallbackLanguage": "en",
	"rememberMe": true,
	"showUDHistory": false,
	"timeout": 6000,
	"timeWarningExpireMembership": 5184000,
	"timeWarningExpire": 7776000,
	"useLocalStorage": true,
	"useRelative": true,
	"initPhase": true,
	"node": {
		"host": "192.168.0.28",
		"port": "9604"
	},
	"plugins": {
		"es": {
			"enable": false,
			"host": "192.168.0.5",
			"port": "9203"
		}
	},
	"version": "0.3.13",
	"build": "2016-10-05T06:32:42.629Z",
	"newIssueUrl": "https://github.com/duniter/cesium/issues/new?labels=bug"
})

;