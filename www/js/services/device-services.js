var App;

angular.module('cesium.device.services', ['cesium.utils.services', 'cesium.settings.services'])

  .factory('Device', function ($rootScope, $translate, $timeout, $ionicPopup, $q, Api, csConfig,
                               // removeIf(no-device)
                               $cordovaClipboard, $cordovaBarcodeScanner, $cordovaCamera, $cordovaNetwork,
                               // endRemoveIf(no-device)
                               ionicReady, UIUtils, Blob, FileSaver) {
    'ngInject';

    var
      CONST = {
        MAX_HEIGHT: 400,
        MAX_WIDTH: 400,
        UTF8_BOM_CHAR: new Uint8Array([0xEF, 0xBB, 0xBF]) // UTF-8 BOM
      },
      api = new Api(this, "Device"),
      exports = {
        // workaround to quickly no is device or not (even before the ready() event)
        enable: true
      },
      cache = {},
      started = false,
      startPromise,
      listeners = {
        online: undefined,
        offline: undefined
      }
    ;

    // removeIf(device)
    // workaround to quickly no is device or not (even before the ready() event)
    exports.enable = false;

    // endRemoveIf(device)

    function getPicture(options) {
      if (!exports.camera.enable) {
        return $q.reject("Camera not enable. Please call 'ionicReady()' once before use (e.g in app.js).");
      }

      // Options is the sourceType by default
      if (options && (typeof options === "string")) {
        options = {
          sourceType: options
        };
      }
      options = options || {};

      // Make sure a source type has been given (if not, ask user)
      if (angular.isUndefined(options.sourceType)) {
        return $translate(['SYSTEM.PICTURE_CHOOSE_TYPE', 'SYSTEM.BTN_PICTURE_GALLERY', 'SYSTEM.BTN_PICTURE_CAMERA'])
          .then(function (translations) {
            return $ionicPopup.show({
              title: translations['SYSTEM.PICTURE_CHOOSE_TYPE'],
              buttons: [
                {
                  text: translations['SYSTEM.BTN_PICTURE_GALLERY'],
                  type: 'button',
                  onTap: function (e) {
                    return navigator.camera.PictureSourceType.PHOTOLIBRARY;
                  }
                },
                {
                  text: translations['SYSTEM.BTN_PICTURE_CAMERA'],
                  type: 'button button-positive',
                  onTap: function (e) {
                    return navigator.camera.PictureSourceType.CAMERA;
                  }
                }
              ]
            })
              .then(function (sourceType) {
                console.info('[camera] User select sourceType:' + sourceType);
                options.sourceType = sourceType;
                return exports.camera.getPicture(options);
              });
          });
      }

      options.quality = options.quality || 50;
      options.destinationType = options.destinationType || navigator.camera.DestinationType.DATA_URL;
      options.encodingType = options.encodingType || navigator.camera.EncodingType.PNG;
      options.targetWidth = options.targetWidth || CONST.MAX_WIDTH;
      options.targetHeight = options.targetHeight || CONST.MAX_HEIGHT;
      return $cordovaCamera.getPicture(options);
    }

    function scan(n) {
      if (!exports.barcode.enable) {
        return $q.reject("Barcode scanner not enable. Please call 'ionicReady()' once before use (e.g in app.js).");
      }
      var deferred = $q.defer();
      cordova.plugins.barcodeScanner.scan(
        function (result) {
          if (!result.cancelled) {
            console.debug('[device] barcode scanner scan: ' + result.text);
            deferred.resolve(result.text); // make sure to convert into String
          } else {
            console.debug('[device] barcode scanner scan: CANCELLED');
            deferred.resolve();
          }
        },
        function (err) {
          console.error('[device] Error while using barcode scanner: ' + err);
          deferred.reject(err);
        },
        n);
      return deferred.promise;
    }

    function copy(text, callback) {
      if (!exports.enable) {
        return $q.reject('Device disabled');
      }
      var deferred = $q.defer();
      $cordovaClipboard
        .copy(text)
        .then(function () {
          // success
          if (callback) {
            callback();
          }
          deferred.resolve();
        }, function () {
          // error
          deferred.reject({message: 'ERROR.COPY_CLIPBOARD'});
        });
      return deferred.promise;
    }

    exports.clipboard = {copy: copy};
    exports.camera = {
      getPicture: getPicture,
      scan: function (n) {
        console.warn('Deprecated use of Device.camera.scan(). Use Device.barcode.scan() instead');
        return scan(n);
      }
    };
    exports.barcode = {
      enable: false,
      scan: scan
    };
    exports.keyboard = {
      enable: false,
      close: function () {
        if (!exports.keyboard.enable) return;
        cordova.plugins.Keyboard.close();
      }
    };
    exports.network = {
      connectionType: function () {

        // If desktop: use ethernet as default connection type
        if (exports.isDesktop()) {
          return 'ethernet';
        }

        try {
          var connectionType = navigator.connection && (navigator.connection.effectiveType || navigator.connection.type) || 'unknown';
          console.debug('[device] Navigator connection type: ' + connectionType);
          switch (connectionType) {
            case 'slow-2g':
            case '2g':
            case 'cell_2g':
              return 'cell_2g';
            case '3g':
            case 'cell_3g':
              return 'cell_3g';
            case 'cell': // iOS
            case '4g':
            case 'cell_4g':
              return 'cell_4g';
            case '5g':
            case 'cell_5g':
              return 'cell_5g';
            case 'wifi':
              return 'wifi';
            case 'ethernet':
              return 'ethernet';
            case 'none':
              return 'none';
            default:
              return 'unknown';
          }
        } catch (err) {
          console.error('[device] Cannot get connection type: ' + (err && err.message || err), err);
          return 'unknown';
        }
      },
      isOnline: function () {
        try {
          return exports.network.connectionType() !== 'none';
        } catch (err) {
          console.error('[device] Cannot check if online: ' + (err && err.message || err), err);
          return true;
        }
      },
      isOffline: function () {
        try {
          return exports.network.connectionType() === 'none';
        } catch (err) {
          console.error('[device] Cannot check if offline: ' + (err && err.message || err), err);
          return true;
        }
        return false;
      },
      timeout: function (defaultTimeout) {
        defaultTimeout = defaultTimeout || csConfig.timeout;
        var timeout;
        try {
          var connectionType = exports.network.connectionType();

          switch (connectionType) {
            case 'ethernet':
              timeout = 1000; // 1 s
              break;
            case 'wifi':
              timeout = 2000;
              break;
            case 'cell_5g':
              timeout = 3000;
              break;
            case 'cell': // (e.g. iOS)
            case 'cell_4g':
              timeout = 5000;
              break;
            case 'cell_3g':
              timeout = 10000; // 10s
              break;
            case 'cell_2g':
              timeout = 30000; // 30s
              break;
            case 'none':
              timeout = 0;
              break;
            case 'unknown':
            default:
              timeout = defaultTimeout;
              break;
          }
          console.debug('[device] Using timeout: {1}ms (connection type: \'{0}\')'.format(connectionType, timeout));

          return timeout;
        } catch (err) {
          console.error('[device] Error while trying to get connection type: ' + (err && err.message || err));
          return defaultTimeout;
        }
      }
    };

    exports.downloader = {
      enable: false,
      download: function(request) {
        return $q(function(resolve, reject) {
          if (!exports.downloader.enable) return reject("Cordova Downloaded plugin is not enable!");
          if (!request) return reject("Missing request argument");

          console.debug('[device] Downloading file from request: ' + JSON.stringify(request));

          cordova.plugins.Downloader.download(request, function(location) {
            console.info("[device] Successfully download file at '{0}'".format(location));
            resolve(location);
          }, function(err) {
            console.error('[device] Cannot download, from given request', request);
            reject(err);
          });
        });
      }
    };
    exports.file = {
      enable: false,
      started: false,
      ready: function() {
        if (exports.file.started) return $q.when();
        return $q(function(resolve) {
          window.addEventListener('filePluginIsReady', function() {

            console.debug('[device] [file] Plugin is ready');

            // DEBUG: dump available directory
            Object.keys(cordova.file).forEach(function(key) {
              console.debug('[device] [file] - cordova.file.{0}: '.format(key) + cordova.file[key]);
            });

            exports.file.started = true;
            resolve();
          }, false);
        });
      },
      save: function(content, options) {

        var filename = options && options.filename || 'export.txt';
        var charset = (options && options.encoding || 'utf-8').toLowerCase();
        var type = options && options.type || 'text/plain';
        var withBOM = charset === 'utf-8' && (!options || options.withBOM !== false);
        var showToast = options && options.showToast || false;

        // Use Cordova file plugin
        if (exports.file.enable) {

          var directory = options && options.directory || (exports.isAndroid() ?
            cordova.file.externalRootDirectory + 'Download' :
            cordova.file.documentsDirectory);
          var fullPath = (directory.endsWith('/') ? directory : (directory + '/')) + filename;
          console.debug("[device] [file] Saving file '{0}' (using Cordova)...".format(fullPath));

          return $q(function (resolve, reject) {

            var onError = function (err) {
              console.error("[device] [file] Error while creating file '{0}': {1}".format(fullPath, err ? JSON.stringify(err): 'Unknown error'));
              reject(err || 'Cannot create file ' + filename);
            };

            window.resolveLocalFileSystemURL(directory, function (directoryEntry) {
              directoryEntry.getFile(filename, {create: true}, function (fileEntry) {

                fileEntry.createWriter(function (fileWriter) {
                  fileWriter.onwriteend = function () {
                    console.debug("[device] [file] Successfully save file '{0}'".format(fullPath));
                    resolve(fullPath);
                  };
                  fileWriter.onerror = function (e) {
                    onError();
                  };
                  var blob = new Blob(
                    // Add UTF-8 BOM character (if enable)
                    withBOM ? [CONST.UTF8_BOM_CHAR, content] : [content],
                    {type: "{0};charset={1};".format(type, charset)});
                  fileWriter.write(blob);
                }, onError);
              }, onError);
            }, onError);
          })
            .then(function (uri) {
              if (showToast) {
                UIUtils.toast.show('INFO.FILE_DOWNLOADED', 1000);
              }
              return uri;
            });
        }

        // Fallback to browser download
        else {
          console.debug("[device] [file] Saving file '{0}'...".format(filename));

          var blob = new Blob(
            // Add UTF-8 BOM character (if enable)
            withBOM ? [CONST.UTF8_BOM_CHAR, content] : [content],
            {type: "{0};charset={1};".format(type, charset)});

          return FileSaver.saveAs(blob, filename, true /*disable auto BOM*/);
        }
      },

      uri: {
        getFilename: function (uri) {
          if (!uri) return uri;
          var filename = uri.trim();

          // Get last part (or all string, if no '/')
          var lastSlashIndex = filename.lastIndexOf('/');
          if (lastSlashIndex !== -1 && lastSlashIndex !== uri.length - 1) {
            filename = filename.substring(lastSlashIndex + 1);
          }

          // Remove query params
          var queryParamIndex = filename.indexOf('?');
          if (queryParamIndex !== -1) {
            filename = filename.substring(0, queryParamIndex);
          }

          return filename;
        },

        getDirectory: function (uri) {
          if (!uri) return uri;
          var directory = uri.trim();

          // Already a folder
          if (directory.endsWith('/')) return directory;

          // Get part before the last slash
          var lastSlashIndex = directory.lastIndexOf('/');
          if (lastSlashIndex !== -1 && lastSlashIndex !== directory.length - 1) {
            return directory.substring(0, lastSlashIndex+1);
          }

          return directory;
        }
      }

    };

    function getLastIntent() {
      var deferred = $q.defer();
      window.plugins.launchmyapp.getLastIntent(
        deferred.resolve,
        deferred.reject);
      return deferred.promise;
    }

    // WARN: Need by cordova-plugin-customurlscheme
    window.handleOpenURL = function (intent) {
      if (intent) {
        console.info('[device] Received new intent: ', intent);
        cache.lastIntent = intent; // Remember, for last()
        api.intent.raise.new(intent);
      }
    };

    exports.intent = {
      enable: false,
      last: function () {
        return $q.when(cache.lastIntent);
      },
      clear: function () {
        cache.lastIntent = undefined;
      }
    };

    // Numerical keyboard - fix #30
    exports.keyboard.digit = {
      settings: {
        bindModel: function (modelScope, modelPath, settings) {
          settings = settings || {};
          modelScope = modelScope || $rootScope;
          var getModelValue = function () {
            return (modelPath || '').split('.').reduce(function (res, path) {
              return res ? res[path] : undefined;
            }, modelScope);
          };
          var setModelValue = function (value) {
            var paths = (modelPath || '').split('.');
            var property = paths.length && paths[paths.length - 1];
            paths.reduce(function (res, path) {
              if (path == property) {
                res[property] = value;
                return;
              }
              return res[path];
            }, modelScope);
          };

          settings.animation = settings.animation || 'pop';
          settings.action = settings.action || function (number) {
            setModelValue((getModelValue() || '') + number);
          };
          if (settings.decimal) {
            settings.decimalSeparator = settings.decimalSeparator || '.';
            settings.leftButton = {
              html: '<span>.</span>',
              action: function () {
                var text = getModelValue() || '';
                // only one '.' allowed
                if (text.indexOf(settings.decimalSeparator) >= 0) return;
                // Auto add zero when started with '.'
                if (!text.trim().length) {
                  text = '0';
                }
                setModelValue(text + settings.decimalSeparator);
              }
            };
          }
          settings.rightButton = settings.rightButton || {
            html: '<i class="icon ion-backspace-outline"></i>',
            action: function () {
              var text = getModelValue();
              if (text && text.length) {
                text = text.slice(0, -1);
                setModelValue(text);
              }
            }
          };
          return settings;
        }
      }
    };

    exports.isAndroid = function () {
      return !!navigator.userAgent.match(/Android/i) || ionic.Platform.is("android");
    };

    exports.isOSX = function () {
      return !!navigator.userAgent.match(/Macintosh/i) || ionic.Platform.is("osx");
    };

    exports.isIOS = function () {
      return !!navigator.userAgent.match(/iPhone | iPad | iPod/i) || (!!navigator.userAgent.match(/Mobile/i) && !!navigator.userAgent.match(/Macintosh/i)) || ionic.Platform.isIOS();
    };

    exports.isWindows = function () {
      return !!navigator.userAgent.match(/Windows/i) || ionic.Platform.is("windows");
    };

    exports.isUbuntu = function () {
      return !!navigator.userAgent.match(/Ubuntu|Linux x86_64/i) || ionic.Platform.is("ubuntu");
    };

    exports.isDesktop = function () {
      if (!angular.isDefined(cache.isDesktop)) {
        try {

          cache.isDesktop = !exports.enable && (
            exports.isUbuntu() ||
            exports.isWindows() ||
            exports.isOSX() ||
            // Should have NodeJs and NW
            (!!process && !!nw && !!nw.App)
          );
        } catch (err) {
          // If error (e.g. 'process not defined')
          cache.isDesktop = false;
        }
      }
      return cache.isDesktop;
    };

    exports.isWeb = function () {
      return !exports.enable && !exports.isDesktop();
    };

    exports.ready = function () {
      if (started) return $q.when();
      return startPromise || exports.start();
    };

    exports.start = function () {
      startPromise = ionicReady()
        .then(function () {

          exports.enable = window.cordova && cordova && !!cordova.plugins || false;
          if (exports.enable) {

            console.debug('[device] Cordova plugins: ' + Object.keys(cordova.plugins));
            console.debug('[device] Windows plugins: ' + Object.keys(window.plugins));

            exports.camera.enable = !!navigator.camera;
            exports.keyboard.enable = cordova && cordova.plugins && !!cordova.plugins.Keyboard;
            exports.barcode.enable = cordova && cordova.plugins && !!cordova.plugins.barcodeScanner && (!exports.isOSX() || exports.isIOS());
            exports.clipboard.enable = cordova && cordova.plugins && !!cordova.plugins.clipboard;
            exports.intent.enable = window && !!window.plugins.launchmyapp;
            exports.clipboard.enable = cordova && cordova.plugins && !!cordova.plugins.clipboard;
            exports.network.enable = navigator.connection && !!navigator.connection.type;
            exports.file.enable = !!cordova.file && (exports.isAndroid() || exports.isIOS());

            if (exports.keyboard.enable) {
              angular.extend(exports.keyboard, cordova.plugins.Keyboard);
            }

            console.info('[device] Ionic platform ready, with {camera: {0}, barcode: {1}, keyboard: {2}, clipboard: {3}, intent: {4}, network: {5}, file: {6}}'
              .format(exports.camera.enable,
                exports.barcode.enable,
                exports.keyboard.enable,
                exports.clipboard.enable,
                exports.intent.enable,
                exports.network.enable,
                exports.file.enable
              ));

            if (cordova.InAppBrowser) {
              console.debug('[device] Enabling InAppBrowser');
              window.open = cordova.InAppBrowser.open;
            }

            // Add network listeners
            if (exports.network.enable) {
              document.addEventListener("offline", function () {
                console.info('[device] Network is offline');
                api.network.raise.offline();
              }, false);
              document.addEventListener("online", function () {
                console.info('[device] Network is online');
                api.network.raise.online();
              }, false);
            }
          } else {
            console.debug('[device] Ionic platform ready - no device detected.');
          }

          started = true;
          startPromise = null;
        });

      return startPromise;
    };

    api.registerEvent('intent', 'new');
    api.registerEvent('network', 'offline');
    api.registerEvent('network', 'online');

    // Export the event api (see ngApi)
    exports.api = api;

    return exports;
  })

;
