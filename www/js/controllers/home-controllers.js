angular.module('cesium.home.controllers', ['cesium.platform', 'cesium.services'])

  .config(function($stateProvider, $urlRouterProvider) {
    'ngInject';

    $stateProvider


      .state('app.home', {
        url: "/home?error&uri",
        views: {
          'menuContent': {
            templateUrl: "templates/home/home.html",
            controller: 'HomeCtrl'
          }
        }
      });

    // if none of the above states are matched, use this as the fallback
    $urlRouterProvider.otherwise('/app/home');

  })

  .controller('HomeCtrl', HomeController)
;

function HomeController($scope, $state, $timeout, $ionicHistory, $translate, $http, $q, $location,
                        UIUtils, BMA, Device, csConfig, csHttp, csCache, csPlatform, csCurrency, csSettings) {
  'ngInject';

  $scope.loading = true;
  $scope.loadingMessage = '';
  $scope.locales = angular.copy(csSettings.locales);
  $scope.smallscreen = UIUtils.screen.isSmall();
  $scope.showInstallHelp = false;

  $scope.enter = function(e, state) {
    if (ionic.Platform.isIOS() && window.StatusBar) {
      // needed to fix Xcode 9 / iOS 11 issue with blank space at bottom of webview
      // https://github.com/meteor/meteor/issues/9041
      StatusBar.overlaysWebView(false);
      StatusBar.overlaysWebView(true);
    }

    if (state && state.stateParams && state.stateParams.uri) {

      return $scope.handleUri(state.stateParams.uri)
        .then(function() {
          $scope.loading = false;
        });
    }
    else if (state && state.stateParams && state.stateParams.error) { // Error query parameter
      $scope.error = state.stateParams.error;
      $scope.node = csCurrency.data.node;
      $scope.loading = false;
      $scope.cleanLocationHref(state);
    }
    else {

      // Wait platform to be ready
      csPlatform.ready()
        .then(function() {
          $scope.loading = false;
          $scope.loadingMessage = '';
          $scope.loadFeeds();
        })
        .catch(function(err) {
          $scope.node =  csCurrency.data.node;
          $scope.loading = false;
          $scope.error = err;
          $scope.loadingMessage = '';
        });
    }
  };
  $scope.$on('$ionicView.enter', $scope.enter);

  $scope.reload = function() {
    $scope.loading = true;
    delete $scope.error;

    $timeout($scope.enter, 200);
  };

  $scope.loadFeeds = function() {
    var feedUrl = csSettings.getFeedUrl();
    if (!feedUrl || typeof feedUrl !== 'string') return; // Skip

    var maxContentLength = (csConfig.feed && csConfig.feed.maxContentLength) || 650;
    var maxAgeInMonths = (csConfig.feed && csConfig.feed.maxAgeInMonths) || 3; // 3 month by default

    // Min unix time, to exclude old topics
    var minDate = moment().subtract(maxAgeInMonths, 'month').utc();
    var minTime = minDate.unix();
    var now = Date.now();
    console.debug("[home] Loading recent feeds at {url: {0}, minTime: '{1}'}".format(feedUrl, minDate.toISOString()));

    $scope.getJson(feedUrl)
      .then(function(feed) {
        console.debug('[home] Feeds loaded in {0}ms'.format(Date.now() - now));

        // Detect Discourse category, then convert
        if ($scope.isDiscourseCategory(feed)) {
          return $scope.parseDiscourseCategory(feedUrl, feed);
        }

        // Detect Discourse topic, then convert
        else if ($scope.isDiscourseTopic(feed)) {
          return $scope.parseDiscourseTopic(feedUrl, feed);
        }

        return feed;
      })
      .then(function(feed) {
        if (!feed || !feed.items) return; // skip

        feed.items = feed.items.reduce(function(res, item) {
          if (!item || (!item.title && !item.content_text && !item.content_html)) return res; // Skip

          // Convert UTC time
          if (item.date_published) {
            item.creationTime = moment.utc(item.date_published).unix();
          }
          if (item.date_modified) {
            item.time = moment.utc(item.date_modified).unix();
          }

          // Skip if too old items
          if (item.creationTime && (item.creationTime < minTime)) return res;

          // Convert content to HTML
          if (item.content_html) {
            item.content = item.content_html;
          }
          else {
            item.content = (item.content_text||'').replace(/\n/g, '<br/>');
          }

          // Trunc content, if need
          if (maxContentLength !== -1 && item.content && item.content.length > maxContentLength) {
            var endIndex = Math.max(item.content.lastIndexOf(" ", maxContentLength), item.content.lastIndexOf("<", maxContentLength));
            item.content = item.content.substring(0, endIndex) + ' (...)';
            item.truncated = true;
          }

          // If author is missing, copy the main author
          item.author = item.author || feed.author;

          return res.concat(item);
        }, []);

        if (!feed.items.length) return; // No items: skip

        $scope.feed = feed;
      })
      .catch(function(err) {
        console.error('[home] Failed to load feeds.', err);
        $scope.feed = null;
      });
  };

  $scope.getJson = function(url) {
    return $q(function(resolve, reject) {
      $http.get(url, {
        timeout: csConfig.timeout,
        responseType: 'json',
        cache: csCache.get(null, csCache.constants.LONG)
      })
      .success(resolve)
      .error(reject)
    });
  };

  $scope.isDiscourseCategory = function(category) {
    return category && category.topic_list && Array.isArray(category.topic_list.topics);
  }

  $scope.parseDiscourseCategory = function(url, category) {
    // Make sure this is a valid topic
    if (!$scope.isDiscourseCategory(category)) throw new Error('Not a discourse category');

    var uri = csHttp.uri.parse(url);
    var baseUrl = uri.protocol + '//' + uri.host + (uri.port != 443 && uri.port != 80 ? uri.port : '');
    var feed = {
      version: "https://jsonfeed.org/version/1", // fixed value
      home_page_url: category.topic_list.more_topics_url.replace(/\?page=[0-9]+/, ''),
      feed_url: url,
      title: 'HOME.FEEDS_TITLE' // FIXME: how get the category title ?
    };

    return $q.all(
      category.topic_list.topics.reduce(function(res, topic) {
        if (!topic.pinned) return res; // Skip not pinned topic

        var topicUrl = [baseUrl, 't', topic.slug, topic.id].join('/') + '.json';
        return res.concat($scope.getJson(topicUrl))
      }, [])
    ).then(function(topics) {
      feed.items = topics.reduce(function(res, topic) {
        if (!$scope.isDiscourseTopic(topic)) return res; // Not a topic: skip
        var feedTopic = $scope.parseDiscourseTopic(baseUrl, topic, feed);

        if (!feedTopic.items || !feedTopic.items.length) return res; // Topic is empty: skip
        return res.concat(feedTopic.items[0]);
      }, []);
      return feed;
    });
  }

  $scope.isDiscourseTopic = function(topic) {
    return topic && topic.title && topic.post_stream && Array.isArray(topic.post_stream.posts);
  }

  $scope.parseDiscourseTopic = function(url, topic, feed) {
    // Make sure this is a valid topic
    if (!$scope.isDiscourseTopic(topic)) throw new Error('Not a discourse topic');

    var uri = csHttp.uri.parse(url);
    var baseUrl = uri.protocol + '//' + uri.host + (uri.port != 443 && uri.port != 80 ? uri.port : '');

    // Prepare root feed, if not yet exists
    feed = feed || {
      version: "https://jsonfeed.org/version/1", // fixed value
      home_page_url: [baseUrl, 't', topic.slug, topic.id].join('/'),
      feed_url: url,
      title: topic.title
    };

    feed.items = topic.post_stream.posts.reduce(function(res, post) {
      if (!post.cooked || post.cooked.trim() === '') return res; // Skip if empty

      var author = {
        name: post.display_username,
        url: [baseUrl, 'u', post.username].join('/'),
        avatar: post.avatar_template ? (baseUrl + post.avatar_template.replace('{size}', '60')) : undefined
      }

      // Try to resolve author pubkey, to replace author url by a link to wot identity
      var developer = _.find(csConfig.developers || [], function(developer) {
        return developer.name && (
          (post.display_username && developer.name.toLowerCase() === post.display_username.toLowerCase()) ||
          (post.username && developer.name.toLowerCase() === post.username.toLowerCase())
        );
      });
      if (developer && developer.pubkey) {
        author.url = '@' + developer.pubkey;
      }

      return res.concat({
        id: post.id,
        url: [baseUrl, 't', post.topic_slug, post.topic_id, post.post_number].join('/'),
        title: feed.title === topic.title ? '' : topic.title, // Only if different
        date_published: post.created_at,
        date_modified: post.updated_at,
        content_html: post.cooked,
        author: author,
        tags: post.tags || topic.tags
      });
    }, []);

    return feed;
  };

  /**
   * Catch click for quick fix
   * @param action
   */
  $scope.doQuickFix = function(action) {
    if (action === 'settings') {
      $ionicHistory.nextViewOptions({
        historyRoot: true
      });
      $state.go('app.settings');
    }
  };

  $scope.changeLanguage = function(langKey) {
    $translate.use(langKey);
    $scope.hideLocalesPopover();
    csSettings.data.locale = _.findWhere($scope.locales, {id: langKey});
    csSettings.store();
    $scope.loadFeeds();
  };

  /* -- show/hide locales popup -- */

  $scope.showLocalesPopover = function(event) {
    UIUtils.popover.show(event, {
      templateUrl: 'templates/common/popover_locales.html',
      scope: $scope,
      autoremove: true,
      afterShow: function(popover) {
        $scope.localesPopover = popover;
      }
    });
  };

  $scope.hideLocalesPopover = function() {
    if ($scope.localesPopover) {
      $scope.localesPopover.hide();
      $scope.localesPopover = null;
    }
  };

  // remove '?uri&error' from the location URI, and inside history
  $scope.cleanLocationHref = function(state) {
    if (state && state.stateParams) {
      var stateParams = angular.copy(state.stateParams);
      delete stateParams.uri;
      delete stateParams.error;

      $location.search(stateParams).replace();

      // Update location href
      $ionicHistory.nextViewOptions({
        disableAnimate: true,
        disableBack: false,
        historyRoot: false
      });
      return $state.go(state.stateName, stateParams, {
          reload: false,
          inherit: true,
          notify: false
        });
    }
  };

  // Listen platform messages
  csPlatform.api.start.on.message($scope, function(message) {
    $scope.loadingMessage = message;
  });

  // Listen network offline/online
  Device.api.network.on.offline($scope, function() {
    csPlatform.stop();
    $scope.loadingMessage = '';
    $scope.loading = false;
    $scope.node =  csCurrency.data.node;
    $scope.error = true;
  });
  Device.api.network.on.online($scope, function() {
    if (!$scope.loading && $scope.error) {
      delete $scope.error;
      $scope.reload();
    }
  });

  // For DEV ONLY
  /*$timeout(function() {
   $scope.loginAndGo();
   }, 500);*/
}
