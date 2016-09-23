/******
* !! WARNING: This is a generated file !!
*
* PLEASE DO NOT MODIFY DIRECTLY
*
* => Changes should be done on file 'app/config.json'.
******/

angular.module("cesium.config", [])

.constant("csConfig", {
	"timeout": 6000,
	"cacheTimeMs": 60000,
	"useRelative": true,
	"timeWarningExpireMembership": 5184000,
	"timeWarningExpire": 7776000,
	"useLocalStorage": true,
	"rememberMe": true,
	"showUDHistory": false,
	"node": {
		"host": "test-net.duniter.fr",
		"port": "9201"
	},
	"plugins": {
		"es": {
			"enable": false,
			"host": "192.168.0.28",
			"port": "9203"
		}
	},
	"version": "0.3.3",
	"build": "2016-09-21T06:18:02.107Z",
	"newIssueUrl": "https://github.com/duniter/cesium/issues/new?labels=bug"
})

;