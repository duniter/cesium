angular.module('cesium.feed.controllers', ['cesium.services'])


  .controller('FeedCtrl', FeedController)
;

function FeedController($scope, $timeout, $http, $translate, $q, csConfig, csHttp, csCache, csSettings) {
  'ngInject';

  $scope.search = {
    loading: true,
    maxCount: (csConfig.feed && csConfig.feed.maxCount) || 3, // 3 month by default
    maxContentLength: (csConfig.feed && csConfig.feed.maxContentLength) || 1300,
    maxAgeInMonths: (csConfig.feed && csConfig.feed.maxAgeInMonths) || 3, // 3 month by default
    minTime: undefined, // unix time
    loadCount: 0,
    maxLoadCount: 2 // = 1 redirection max
  };

  $scope.enter = function(e, state) {
    // Wait platform to be ready
    csSettings.ready()
      .then(function() {
        return $scope.load();
      })
      .catch(function() {
        // Continue
        return null;
      })
      .then(function(feed) {
        $scope.loading = false;
        $scope.feed = feed;
        var showFeed = feed && feed.items && feed.items.length > 0 || false;
        $scope.$parent.toggleFeed(showFeed);
      });
  };

  $scope.$on('$ionicParentView.enter', $scope.enter);

  $scope.load = function() {
    var feedUrl = csSettings.getFeedUrl();
    if (!feedUrl || typeof feedUrl !== 'string') return; // Skip

    // Min unix time, to exclude old topics
    var maxAgeInMonths = $scope.search.maxAgeInMonths;
    var minDate = maxAgeInMonths > 0 ? moment().subtract(maxAgeInMonths, 'month').startOf('day').utc() : undefined;
    $scope.search.minTime = minDate && minDate.unix();

    // Reset load counter
    $scope.search.loadCount = 0;

    var now = Date.now();
    console.debug("[feed] Loading from {url: {0}, minTime: '{1}'}".format(feedUrl, minDate && minDate.toISOString() || 'all'));

    return $scope.loadJsonFeed(feedUrl)
      .then(function (feed) {
        console.debug('[feed] {0} items loaded in {0}ms'.format(feed && feed.items && feed.items.length || 0, Date.now() - now));

        if (!feed || !feed.items) return null; // skip

        // Clean title (remove duplicated titles)
        $scope.cleanDuplicatedTitles(feed);

        return feed;
      })
      .catch(function(err) {
        console.error('[feed] Failed to load.', err);
        return null;
      });
  };

  /**
   * Load a JSON file, from the given URL, and convert into the JSON Feed format
   * @param feedUrl
   * @param maxCount
   * @returns {*}
   */
  $scope.loadJsonFeed = function(feedUrl, maxItemCount) {
    var locale = $translate.use();
    var minTime = $scope.search.minTime;
    maxItemCount = maxItemCount || $scope.search.maxCount;

    // Increment load counter (to avoid infinite loop)
    $scope.search.loadCount++;

    return $scope.getJson(feedUrl)
      .then(function(json) {

        // Parse JSON from discourse
        if ($scope.isJsonDiscourse(json)) {
          return $scope.parseJsonDiscourse(feedUrl, json);
        }

        // Return a copy (to avoid any change in cached data)
        return angular.copy(json);
      })
      .then(function(feed) {
        if (!feed || !feed.items && !feed.next_url) return null; // skip

        // SKip if incompatible language
        if (feed.language && !$scope.isCompatibleLanguage(locale, feed.language)) {
          console.debug("[feed] Skip feed item '{0}' - Expected language: '{1}', actual: '{2}'".format(feed.title, locale, feed.language));
          return null;
        }

        feed.items = (feed.items || []).reduce(function (res, item) {

          // Skip if empty (missing title and content)
          if ($scope.isEmptyFeedItem(item)) return res;

          item = $scope.prepareJsonFeedItem(item, feed);

          // Skip if too old items
          if (minTime > 0 && item.creationTime && (item.creationTime < minTime)) return res;

          // Skip if not same language
          if (item.language && !$scope.isCompatibleLanguage(locale, item.language)) {
            console.debug("[feed] Feed item '{0}' EXCLUDED - expected locale: {1}, actual language: {2}".format(item.title || feed.title, locale, item.language));
            return res;
          }

          return res.concat(item);
        }, []);


        return feed;
      })
      .then(function(feed) {
        if (!feed) return null; // skip
        feed.items = feed.items || [];

        // Slice to keep last (more recent) items
        if (feed.items.length > maxItemCount) {
          feed.items = feed.items.slice(feed.items.length - maxItemCount);
          return feed;
        }

        // Not enough items: try to fetch more
        var canFetchMore = feed.next_url && feed.next_url !== feedUrl && $scope.search.loadCount < $scope.search.maxLoadCount;
        if (canFetchMore && feed.items.length < maxItemCount) {

          console.debug("[feed] Loading from {next_url: '{0}'}".format(feed.next_url));

          // Fetch more
          return $scope.loadJsonFeed(feed.next_url, maxItemCount - feed.items.length)
            .then(function(moreFeed) {
              // Append new items
              if (moreFeed && moreFeed.items && moreFeed.items.length) {
                feed.items = feed.items.concat(moreFeed.items.slice(0, maxItemCount - feed.items.length));
              }

              return feed;
            });
        }

        return feed;
      });
  };

  /**
   * Fetch a JSON file, from a URL. Use a cache (of 1 hour) to avoid to many network request
   * @param url
   * @returns {*}
   */
  $scope.getJson = function(url) {
    return $q(function(resolve, reject) {
      $http.get(url, {
        timeout: csConfig.timeout,
        responseType: 'json',
        cache: csCache.get('csFeed-', csCache.constants.LONG)
      })
      .success(resolve)
      .error(reject)
    });
  };

  $scope.isEmptyFeedItem = function(item) {
    return (!item || (!item.title && !item.content_text && !item.content_html));
  };

  /**
   * Prepare a feed for the template :
   * - set 'time' with a unix timestamp
   * - set 'content' with the HTML or text content (truncated if too long)
   * - fill authors if not exists, using feed authors
   * @param item
   * @param feed
   * @returns {{content}|*}
   */
  $scope.prepareJsonFeedItem = function(item, feed) {
    if ($scope.isEmptyFeedItem(item)) throw Error('Empty feed item')

    var maxContentLength = $scope.search.maxContentLength;

    // Convert UTC time
    if (item.date_published) {
      item.creationTime = moment.utc(item.date_published).unix();
    }
    if (item.date_modified) {
      item.time = moment.utc(item.date_modified).unix();
    }

    // Convert content to HTML
    if (item.content_html) {
      item.content = item.content_html;
    }
    else {
      item.content = (item.content_text||'').replace(/\n/g, '<br/>');
    }

    // Trunc content, if need
    if (maxContentLength > 0 && item.content && item.content.length > maxContentLength) {
      var endIndex = Math.max(item.content.lastIndexOf(" ", maxContentLength), item.content.lastIndexOf("<", maxContentLength));
      item.content = item.content.substring(0, endIndex) + ' (...)';
      item.truncated = true;
    }

    // If author is missing, copy the main author
    item.authors = item.authors || feed.authors;

    return item;
  };

  /**
   * Prepare feed (e.g. clean duplicated title, when feed URL is a discourse topic, all item will have the same title)
   * @param feed
   * @returns {*}
   */
  $scope.cleanDuplicatedTitles = function(feed) {
    if (!feed || !feed.items) return feed;

    _.forEach(feed.items, function(item, index) {
      if (item.title && index > 0 && (item.title === feed.items[0].title)) {
        delete item.title;
      }
    });
    return feed;
  };

  /**
   * Detect this the given JSON is from Discourse
   * @param json
   * @returns {*}
   */
  $scope.isJsonDiscourse = function(json) {
    return $scope.isDiscourseCategory(json) || $scope.isDiscourseTopic(json);
  };

  /**
   * Transform a JSON from Discourse into JSON feed
   * @param feedUrl
   * @param json
   * @returns {*}
   */
  $scope.parseJsonDiscourse = function(feedUrl, json) {
    // Detect if category category
    if ($scope.isDiscourseCategory(json)) {
      // Convert category to feed
      return $scope.parseDiscourseCategory(feedUrl, json);
    }

    // Convert topic to feed
    return $scope.parseDiscourseTopic(feedUrl, json);
  };

  $scope.isDiscourseCategory = function(category) {
    return category && category.topic_list && Array.isArray(category.topic_list.topics) &&
      !!category.topic_list.more_topics_url || false;
  };

  $scope.parseDiscourseCategory = function(url, category, locale) {
    // Check is a discourse category
    if (!$scope.isDiscourseCategory(category)) throw new Error('Not a discourse category');

    locale = locale || $translate.use();
    var uri = csHttp.uri.parse(url);
    var baseUrl = uri.protocol + '//' + uri.host + (uri.port != 443 && uri.port != 80 ? uri.port : '');
    var pageUrl = baseUrl + category.topic_list.more_topics_url.replace(/\?page=[0-9]+/, '');
    var feed = {
      version: "https://jsonfeed.org/version/1.1", // fixed value
      home_page_url: pageUrl,
      feed_url: url,
      title: 'HOME.FEEDS_TITLE'
    };

    return $q.all(
      category.topic_list.topics.reduce(function(res, topic) {
        if (!topic.pinned || !topic.visible) return res; // Skip not pinned topic

        // Exclude category description (=tag 'about-category')
        if (topic.tags && topic.tags.includes('about-category')) return res;

        // Detect language, from the title. Then skip if not compatible with expected locale
        var topicLanguage = $scope.getLanguageFromTitle(topic.title);
        if (!$scope.isCompatibleLanguage(locale, topicLanguage)) return res;

        // Compute the URL to load the topic
        var topicUrl = [baseUrl, 't', topic.slug, topic.id].join('/') + '.json';

        // Load topic JSON
        return res.concat($scope.getJson(topicUrl)
          .catch(function(err) {
            console.error("[feed] Failed to load discourse topic from '{}'".format(topicUrl), err);
            return null; // continue
          })
        )
      }, []))
      .then(function(topics) {
        feed.items = topics.reduce(function(res, topic) {
          if (!$scope.isDiscourseTopic(topic)) return res; // Not a topic: skip

          var feedTopic = $scope.parseDiscourseTopic(baseUrl, topic, feed);

          if (!feedTopic.items || !feedTopic.items.length) return res; // Topic is empty: skip

          return res.concat(feedTopic.items[0]);
        }, []);
      return feed;
    });
  };

  $scope.isDiscourseTopic = function(topic) {
    return topic && topic.title && topic.post_stream && Array.isArray(topic.post_stream.posts);
  };

  $scope.parseDiscourseTopic = function(url, topic, feed) {
    // Make sure this is a valid topic
    if (!$scope.isDiscourseTopic(topic)) throw new Error('Not a discourse topic');

    var uri = csHttp.uri.parse(url);
    var baseUrl = uri.protocol + '//' + uri.host + (uri.port != 443 && uri.port != 80 ? uri.port : '');

    // Clean title (e.g. remove '(fr)' or '(en)' or '(es)')
    // Prefer unicode title (e.g. emoji are replaced)
    var title = $scope.cleanTitle(topic.unicode_title || topic.title);
    var language = $scope.getLanguageFromTitle(topic.title);

    // Prepare root feed, if not yet exists
    feed = feed || {
      version: "https://jsonfeed.org/version/1.1", // fixed value
      home_page_url: [baseUrl, 't', topic.slug, topic.id].join('/'),
      feed_url: url,
      title: 'HOME.FEEDS_TITLE',
      language: language
    };
    feed.language = feed.language || language;

    feed.items = topic.post_stream.posts.reduce(function(res, post) {
      if (!post.cooked || post.cooked.trim() === '') return res; // Skip if empty

      // SKip if hidden, or deleted post
      if (post.hidden || post.deleted_at) return res;

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

      // Fill parent feed defaults
      feed.authors = feed.authors || [author];

      return res.concat({
        id: post.id,
        url: [baseUrl, 't', post.topic_slug, post.topic_id, post.post_number].join('/'),
        title: title,
        date_published: post.created_at,
        date_modified: post.updated_at,
        content_html: post.cooked,
        authors: [author],
        language: language,
        tags: post.tags || topic.tags
      });
    }, []);

    return feed;
  };

  /**
   * Clean a title : remove locale string at the end (e.g. '(fr)' or '(en)' or '(es)')
   * @param title
   */
  $scope.cleanTitle = function(title) {
    if (!title) return undefined;
    return title.replace(/\s\([a-z]{2}(:?-[A-Z]{2})?\)$/, '');
  };

  /**
   * Clean a title : remove locale string at the end (e.g. '(fr)' or '(en)' or '(es)')
   * @param title
   */
  $scope.getLanguageFromTitle = function(title) {
    if (!title) return undefined;
    var matches = /\s\(([a-z]{2}(:?-[A-Z]{2})?)\)$/.exec(title);
    return matches && matches[1];
  };

  $scope.isCompatibleLanguage = function(expectedLocale, language) {
    if (!expectedLocale || !language || expectedLocale === language) return true;

    // Extract the language from the locale, then compare
    // E.g. 'fr-FR' => 'fr'
    var expectedLanguage = expectedLocale.split('-', 2)[0];

    return expectedLanguage.toLowerCase() === language.toLowerCase();
  };

  csSettings.api.locale.on.changed($scope, function() {
    if ($scope.loading) return;
    console.debug("[feed] Locale changed. Reload feed...");
    $scope.enter();
  });
}
