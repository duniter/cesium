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
	"rememberMe": false,
	"showUDHistory": false,
	"timeout": 4000,
	"timeWarningExpireMembership": 5184000,
	"timeWarningExpire": 7776000,
	"useLocalStorage": false,
	"useRelative": true,
	"initPhase": false,
	"node": {
		"host": "test-net.duniter.fr",
		"port": "9201"
	},
	"plugins": {
		"es": {
			"enable": true,
			"host": "data.duniter.fr",
			"port": "80"
		}
	},
	"version": "0.3.11",
	"build": "2016-09-30T23:47:45.815Z",
	"newIssueUrl": "https://github.com/duniter/cesium/issues/new?labels=bug"
})

;