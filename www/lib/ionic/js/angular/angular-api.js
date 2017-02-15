// Source: https://github.com/Schweigi/angular-api-demo/blob/master/api.js
(function(window, angular, undefined) {'use strict';

    // This file is adapted from Angular UI ngGrid project
    // MIT License
    // https://github.com/angular-ui/ng-grid/blob/v3.0.0-rc.20/src/js/core/factories/GridApi.js
    angular.module('ngApi', []).factory('Api', ['$q', '$rootScope', function($q, $rootScope) {
        /**
         * Api provides the ability to register public methods events inside an app and allow
         * for other components to use the api via featureName.raise.methodName and featureName.on.eventName(function(args){}).
         *
         * @appInstance: App which the API is for
         * @apiId: Unique id in case multiple API instances do exist inside the same Angular environment
         */
        var Api = function Api(appInstance, apiId) {
            this.gantt = appInstance;
            this.apiId = apiId;
            this.eventListeners = [];
        };

        /**
         * Used to execute a function while disabling the specified event listeners.
         * Disables the listenerFunctions, executes the callbackFn, and then enables the listenerFunctions again
         *
         * @listenerFuncs: Listener function or array of listener functions to suppress. These must be the same
         * @functions that were used in the .on.eventName method
         * @callBackFn: Function to execute with surpressed events
         *
         * Example:
         *    var clicked = function (){
         *       // Button clicked event handler
         *    }
         *
         *    api.suppressEvents(clicked, function() {
         *       // No clicked events will be fired
         *       api.ui.form.main.submit.click(scope);
         *    });
         */
        Api.prototype.suppressEvents = function(listenerFuncs, callBackFn) {
            var self = this;
            var listeners = angular.isArray(listenerFuncs) ? listenerFuncs : [listenerFuncs];

            var foundListeners = [];
            listeners.forEach(function(l) {
                foundListeners = self.eventListeners.filter(function(lstnr) {
                    return l === lstnr.handler;
                });
            });

            foundListeners.forEach(function(l) {
                l.dereg();
            });

            callBackFn();

            foundListeners.forEach(function(l) {
                l.dereg = registerEventWithAngular(l.eventId, l.handler, self.gantt, l._this);
            });

        };

        /**
         * Registers a new event for the given feature.
         *
         * @featureName: Name of the feature that raises the event
         * @eventName: Name of the event
         *
         * To trigger the event call:
         * .raise.eventName()
         *
         * To register a event listener call:
         * .on.eventName(scope, callBackFn, _this)
         * scope: A scope reference to add a deregister call to the scopes .$on('destroy')
         * callBackFn: The function to call
         * _this: Optional this context variable for callbackFn. If omitted, gantt.api will be used for the context
         *
         * .on.eventName returns a de-register funtion that will remove the listener. It's not necessary to use it as the listener
         * will be removed when the scope is destroyed.
         */
        Api.prototype.registerEvent = function(featureName, eventName) {
            var self = this;
            if (!self[featureName]) {
                self[featureName] = {};
            }

            var feature = self[featureName];
            if (!feature.on) {
                feature.on = {};
                feature.raise = {};
                feature.raisePromise = {};
            }

            var eventId = 'event:api:' + this.apiId + ':' + featureName + ':' + eventName;

            // Creating raise event method: featureName.raise.eventName
            feature.raise[eventName] = function() {
              $rootScope.$emit.apply($rootScope, [eventId].concat(Array.prototype.slice.call(arguments)));
            };

            // Creating raise that return a promise event method: featureName.raisePromise.eventName
            feature.raisePromise[eventName] = function() {
              // If no listener: continue
              if (!$rootScope.$$listenerCount[eventId]) {
                return $q.when();
              }
              // Add promise reject/resolve has last arguments
              var deferred = $q.defer();
              var eventArgs = [eventId].concat(Array.prototype.slice.call(arguments)).concat([deferred]);
              $rootScope.$emit.apply($rootScope, eventArgs);
              return deferred.promise;
            };

            // Creating on event method: featureName.oneventName
            feature.on[eventName] = function(scope, handler, _this) {
                var deregAngularOn = registerEventWithAngular(eventId, handler, self.gantt, _this);

                var listener = {
                    handler: handler,
                    dereg: deregAngularOn,
                    eventId: eventId,
                    scope: scope,
                    _this: _this
                };
                self.eventListeners.push(listener);
                /*if (!self.eventListenersByEventId[eventId]) {
                  self.eventListenersByEventId[eventId] = {};
                }
                self.eventListenersByEventId[eventId].push(self.eventListenersByEventId[eventId]);*/

                var removeListener = function() {
                    listener.dereg();
                    var index = self.eventListeners.indexOf(listener);
                    self.eventListeners.splice(index, 1);
                    // If empty, completely remove the event array
                    //if (!$rootScope.$$listenerCount[eventId]) {
                    //  delete $rootScope.$$listeners[eventId];
                    //}
                };

                scope.$on('$destroy', function() {
                    removeListener();
                });

                return removeListener;
            };
        };

        function registerEventWithAngular(eventId, handler, app, _this) {
            return $rootScope.$on(eventId, function() {
                var args = Array.prototype.slice.call(arguments);
                args.splice(0, 1); // Remove evt argument
                handler.apply(_this ? _this : app, args);
            });
        }

        /**
         * Used to execute a function while disabling the specified event listeners.
         * Disables the listenerFunctions, executes the callbackFn, and then enables the listenerFunctions again
         *
         * @listenerFuncs: Listener function or array of listener functions to suppress. These must be the same
         * @functions that were used in the .on.eventName method
         * @callBackFn: Function to execute with surpressed events
         *
         * Example:
         *    var clicked = function (){
         *       // Button clicked event handler
         *    }
         *
         *    api.suppressEvents(clicked, function() {
         *       // No clicked events will be fired
         *       api.ui.form.main.submit.click(scope);
         *    });
         */
        Api.prototype.hasListeners = function(listenerFuncs, callBackFn) {
            var self = this;
            var listeners = angular.isArray(listenerFuncs) ? listenerFuncs : [listenerFuncs];

            var foundListeners = [];
            listeners.forEach(function(l) {
                foundListeners = self.eventListeners.filter(function(lstnr) {
                    return l === lstnr.handler;
                });
            });

            foundListeners.forEach(function(l) {
                l.dereg();
            });

            callBackFn();

            foundListeners.forEach(function(l) {
                l.dereg = registerEventWithAngular(l.eventId, l.handler, self.gantt, l._this);
            });

        };

        /**
         * Registers a new event for the given feature
         *
         * @featureName: Name of the feature
         * @methodName: Name of the method
         * @callBackFn: Function to execute
         * @_this: Binds callBackFn 'this' to _this. Defaults to Api.app
         */
        Api.prototype.registerMethod = function(featureName, methodName, callBackFn, _this) {
            if (!this[featureName]) {
                this[featureName] = {};
            }

            var feature = this[featureName];
            feature[methodName] = function() {
                callBackFn.apply(_this || this.app, arguments);
            };
        };

        return Api;
    }]);
})(window, window.angular);
