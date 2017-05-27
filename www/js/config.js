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
	"timeout": 10000,
	"timeWarningExpireMembership": 5184000,
	"timeWarningExpire": 7776000,
	"useLocalStorage": true,
	"useRelative": false,
	"initPhase": false,
	"expertMode": true,
	"decimalCount": 2,
	"httpsMode": false,
	"helptip": {
		"enable": false,
		"installDocUrl": "https://github.com/duniter/duniter/blob/master/doc/install-a-node.md"
	},
	"node": {
		"host": "g1.duniter.org",
		"port": "443"
	},
	"plugins": {
		"es": {
			"enable": true,
			"askEnable": false,
			"host": "localhost",
			"port": "9200",
			"wsPort": "9400"
		},
		"graph": {
			"enable": true
		},
		"neo4j": {
			"enable": true
		},
    "rml9": {
      "enable": true
    },
	},
	"version": "0.12.6",
	"build": "2017-05-23T08:45:46.819Z",
	"newIssueUrl": "https://github.com/duniter/cesium/issues/new?labels=bug"
})

;
