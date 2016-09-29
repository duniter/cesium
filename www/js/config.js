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
		"host": "192.168.0.28",
		"port": "9600"
	},
	"plugins": {
		"es": {
			"enable": false,
			"host": "192.168.0.28",
			"port": "9203"
		}
	},
	"version": "0.3.6",
	"build": "2016-09-29T14:37:01.038Z",
	"newIssueUrl": "https://github.com/duniter/cesium/issues/new?labels=bug"
})

;