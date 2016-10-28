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
	"timeout": 10000,
	"timeWarningExpireMembership": 5184000,
	"timeWarningExpire": 7776000,
	"useLocalStorage": true,
	"useRelative": true,
	"initPhase": false,
	"expertMode": false,
	"helptip": {
		"enable": true,
		"installDocUrl": "https://github.com/duniter/duniter/blob/master/doc/install-a-node.md"
	},
	"node": {
		"host": "test-net.duniter.fr",
		"port": "9201"
	},
	"plugins": {
		"es": {
			"enable": true,
			"askEnable": false,
			"host": "data.duniter.fr",
			"port": "80"
		}
	},
	"version": "0.4.4",
	"build": "2016-10-28T14:05:10.273Z",
	"newIssueUrl": "https://github.com/duniter/cesium/issues/new?labels=bug"
})

;