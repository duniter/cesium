'use strict';

const gulp = require('gulp'),
  path = require("path"),
  sass = require('gulp-sass')(require('node-sass')),
  cleanCss = require('gulp-clean-css'),
  base64 = require('gulp-base64-v2'),
  rename = require('gulp-rename'),
  ngConstant = require('gulp-ng-constant'),
  fs = require("fs"),
  header = require('gulp-header'),
  footer = require('gulp-footer'),
  removeCode = require('gulp-remove-code'),
  removeHtml = require('gulp-html-remove'),
  templateCache = require('gulp-angular-templatecache'),
  ngTranslate = require('gulp-angular-translate'),
  ngAnnotate = require('gulp-ng-annotate'),
  zip = require('gulp-zip'),
  del = require('del'),
  debug = require('gulp-debug'),
  useref = require('gulp-useref'),
  filter = require('gulp-filter'),
  uglify = require('gulp-uglify-es').default,
  sourcemaps = require('gulp-sourcemaps'),
  lazypipe = require('lazypipe'),
  csso = require('gulp-csso'),
  replace = require('gulp-replace'),
  clean = require('gulp-clean'),
  htmlmin = require('gulp-htmlmin'),
  jshint = require('gulp-jshint'),
  markdown = require('gulp-markdown'),
  merge = require('merge2'),
  log = require('fancy-log'),
  colors = require('ansi-colors'),
  {argv} = require('yargs'),
  sriHash = require('gulp-sri-hash'),
  sort = require('gulp-sort'),
  map = require('map-stream');

  // Workaround because @ioni/v1-toolkit use gulp v3.9.2 instead of gulp v4
  let jsonlint;
  try {
    jsonlint = require('@prantlf/gulp-jsonlint');
  } catch(e) {
    log(colors.red("Cannot load 'gulp-jsonlint'. Retrying using project path"), e);
  }


const paths = {
  license_md: ['./www/license/*.md'],
  sass: ['./scss/ionic.app.scss'],
  config: ['./app/config.json'],
  templatecache: ['./www/templates/**/*.html'],
  ng_translate: ['./www/i18n/locale-*.json'],
  ng_annotate: ['./www/js/**/*.js', '!./www/js/vendor/*.js'],
  // plugins:
  leafletSass: ['./scss/leaflet.app.scss'],
  css_plugin: ['./www/plugins/*/css/**/*.css'],
  templatecache_plugin: ['./www/plugins/*/templates/**/*.html'],
  ng_translate_plugin: ['./www/plugins/*/i18n/locale-*.json'],
  ng_annotate_plugin: ['./www/plugins/*/**/*.js', '!./www/plugins/*/js/vendor/*.js']
};

const uglifyBaseOptions = {
  toplevel: true,
  warnings: true,
  mangle: {
    reserved: ['qrcode', 'Base58']
  },
  compress: {
    global_defs: {
      "@console.log": "alert"
    },
    passes: 2
  },
  output: {
    beautify: false,
    preamble: "/* minified */",
    max_line_len: 120000
  }
};
const cleanCssOptions = {
  specialComments: 0 // new name of 'keepSpecialComments', since 4.0
}
const debugBaseOptions = {
  title: 'Processing',
  minimal: true,
  showFiles: argv.debug || false,
  showCount: argv.debug || false,
  logger: m => log(colors.grey(m))
};

function appAndPluginWatch(done) {

  log(colors.green('Watching source files...'));

  // Licenses
  gulp.watch(paths.license_md, () => appLicense());

  // App
  gulp.watch(paths.sass, () => appSass());
  gulp.watch(paths.templatecache, () => appNgTemplate());
  gulp.watch(paths.ng_annotate, (event) => appNgAnnotate(event));
  gulp.watch(paths.ng_translate, () => appNgTranslate());
  // Plugins
  gulp.watch(paths.templatecache_plugin, () => pluginNgTemplate());
  gulp.watch(paths.ng_annotate_plugin, (event) => pluginNgAnnotate(event));
  gulp.watch(paths.ng_translate_plugin, () => pluginNgTranslate());
  gulp.watch(paths.css_plugin.concat(paths.leafletSass), () => pluginSass());

  if (done) done();
}


function appAndPluginClean() {
  return del([
    './www/dist',
    './www/css/ionic.app*.css',
    './www/css/leaflet.app*.css'
  ]);
}

/**
 * Generate App CSS (using SASS)
 * @returns {*}
 */
function appSass() {
  log(colors.green('Building App Sass...'));

  // Default App style
  return gulp.src('./scss/ionic.app.scss')

    .pipe(sass()).on('error', sass.logError)
    .pipe(base64({
      baseDir: "./www/css",
      extensions: ['svg', 'png', 'gif', /\.jpg#datauri$/i],
      maxImageSize: 14 * 1024
    }))
    .pipe(gulp.dest('./www/css/'))
    .pipe(cleanCss(cleanCssOptions))
    .pipe(rename({ extname: '.min.css' }))
    .pipe(gulp.dest('./www/css/'));
}

function appConfig() {
  const allConfig = JSON.parse(fs.readFileSync('./app/config.json', 'utf8'));

  // Determine which environment to use when building config.
  const env = argv.env || 'default';
  const config = allConfig[env];

  if (!config) {
    throw new Error(colors.red("=> Could not load `" + env + "` environment!"));
  }

  log(colors.green("Building App config at `www/js/config.js` for `" + env + "` environment..."));

  const project = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
  config['version'] = project.version;
  config['build'] = (new Date()).toJSON();
  config['newIssueUrl'] = project.bugs.new;

  return ngConstant({
    name: 'cesium.config',
    constants: {"csConfig": config},
    stream: true,
    dest: 'config.js'
  })
    // Add a warning header
    .pipe(header("/******\n* !! WARNING: This is a generated file !!\n*\n* PLEASE DO NOT MODIFY DIRECTLY\n*\n* => Changes should be done on file 'app/config.json'.\n******/\n\n"))
    // Writes into file www/js/config.js
    .pipe(rename('config.js'))
    .pipe(gulp.dest('www/js'));
}

function appConfigTest() {
  const allConfig = JSON.parse(fs.readFileSync('./app/config.json', 'utf8'));

  // Determine which environment to use when building config.
  const env = 'g1-test';
  const config = allConfig[env];

  if (!config) {
    throw new Error(colors.red("=> Could not load `" + env + "` environment!"));
  }

  log(colors.green("Building App test config at `www/js/config-test.js` for `" + env + "` environment..."));

  const project = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
  config['version'] = project.version;
  config['build'] = (new Date()).toJSON();
  config['newIssueUrl'] = project.bugs.new;

  return ngConstant({
    name: 'cesium.config',
    constants: {"csConfig": config},
    stream: true,
    dest: 'config-test.js'
  })
    // Add a warning header
    .pipe(header("/******\n* !! WARNING: This is a generated file !!\n*\n* PLEASE DO NOT MODIFY DIRECTLY\n*\n* => Changes should be done on file 'app/config.json'.\n******/\n\n"))
    // Writes into file www/js/config-test.js
    .pipe(rename('config-test.js'))
    .pipe(gulp.dest('www/js'));
}

function appAndPluginLint() {
  log(colors.green('Linting JS files...'));

  // Copy Js (and remove unused code)
  return gulp.src(paths.ng_annotate.concat(paths.ng_annotate_plugin))
    .pipe(debug({...debugBaseOptions, title: 'Linting'}))
    .pipe(jshint())
    .pipe(jshint.reporter(require('jshint-stylish')))
    .pipe(map( (file, cb) => {
      if (!file.jshint.success) {
        console.error('jshint failed');
        process.exit(1);
      }
      cb();
    }));
}

function appNgTemplate() {
  log(colors.green('Building template file...'));

  return gulp.src(paths.templatecache)
    .pipe(sort())
    .pipe(templateCache({
      standalone: true,
      module: "cesium.templates",
      root: "templates/"
    }))
    .pipe(gulp.dest('./www/dist/dist_js/app'));
}

function appNgAnnotate(event) {

  // If watch, apply only on changes files
  if (event && event.type === 'changed' && event.path && event.path.indexOf('/www/js/') !== -1) {
    let path = event.path.substring(event.path.indexOf('/www/js') + 7);
    path = path.substring(0, path.lastIndexOf('/'));
    return gulp.src(event.path)
      .pipe(ngAnnotate({single_quotes: true}))
      .pipe(gulp.dest('./www/dist/dist_js/app' + path));
  }

  log(colors.green('Building JS files...'));
  return gulp.src(paths.ng_annotate)
    .pipe(ngAnnotate({single_quotes: true}))
    .pipe(gulp.dest('./www/dist/dist_js/app'));
}

function appNgTranslate() {
  log(colors.green('Building translation file...'));

  return gulp.src('www/i18n/locale-*.json')
    .pipe(jsonlint())
    .pipe(jsonlint.reporter())
    .pipe(sort())
    .pipe(ngTranslate({standalone:true, module: 'cesium.translations'}))
    .pipe(gulp.dest('www/dist/dist_js/app'));
}

function appLicense() {
  log(colors.green('Building License files...'));

  return merge(
    // Copy license into HTML
    gulp.src(paths.license_md)
      .pipe(markdown())
      .pipe(header('<html><header><meta charset="utf-8"></header><body>'))
      .pipe(footer('</body></html>'))
      .pipe(gulp.dest('www/license')),

    // Copy license into txt
    gulp.src(paths.license_md)
      .pipe(header('\ufeff')) // Need BOM character for UTF-8 files
      .pipe(rename({ extname: '.txt' }))
      .pipe(gulp.dest('www/license'))
  );
}

/* -- Plugins -- */

function pluginNgTemplate() {
  log(colors.green('Building Plugins template file...'));

  return gulp.src(paths.templatecache_plugin)
    .pipe(sort())
    .pipe(templateCache({
      standalone: true,
      module: "cesium.plugins.templates",
      root: "plugins/"
    }))
    .pipe(gulp.dest('./www/dist/dist_js/plugins'));
}

function pluginNgAnnotate(event) {

  // If watch, apply only on changes files
  if (event && event.type === 'changed' && event.path && event.path.indexOf('/www/js/') !== -1) {
    let path = event.path.substring(event.path.indexOf('/www/js') + 7);
    path = path.substring(0, path.lastIndexOf('/'));
    return gulp.src(event.path)
      .pipe(ngAnnotate({single_quotes: true}))
      .pipe(gulp.dest('./www/dist/dist_js/app' + path));
  }

  log(colors.green('Building Plugins JS file...'));
  return gulp.src(paths.ng_annotate_plugin)
    .pipe(ngAnnotate({single_quotes: true}))
    .pipe(gulp.dest('./www/dist/dist_js/plugins'));
}

function pluginNgTranslate() {
  log(colors.green('Building Plugins translation file...'));

  return gulp.src(paths.ng_translate_plugin)
    .pipe(jsonlint())
    .pipe(jsonlint.reporter())
    .pipe(sort())
    .pipe(ngTranslate({standalone:true, module: 'cesium.plugins.translations'}))
    .pipe(gulp.dest('www/dist/dist_js/plugins'));
}

function pluginLeafletImages(dest) {
  dest = dest || './www/img/';
  // Leaflet images
  return gulp.src(['scss/leaflet/images/*.*',
    'www/lib/leaflet/dist/images/*.*',
    'www/lib/leaflet-search/images/*.*',
    '!www/lib/leaflet-search/images/back.png',
    '!www/lib/leaflet-search/images/leaflet-search.jpg',
    'www/lib/leaflet.awesome-markers/dist/images/*.*'],
      {read: false, allowEmpty: true}
    )
    .pipe(gulp.dest(dest));
}

function pluginSass() {
  log(colors.green('Building Plugins Sass...'));

  return merge(

    // Copy plugins CSS
    gulp.src(paths.css_plugin)
      .pipe(gulp.dest('www/dist/dist_css/plugins')),

    // Leaflet images
    pluginLeafletImages('./www/img/'),

    // Leaflet App style
    gulp.src('./scss/leaflet.app.scss')
      .pipe(sass()).on('error', sass.logError)
      // Fix bad images path
      .pipe(replace("url('../images/", "url('../img/"))
      .pipe(replace("url(\"../images/", "url(\"../img/"))
      .pipe(replace("url('images/", "url('../img/"))
      .pipe(replace("url(\"images/", "url(\"../img/"))
      .pipe(replace("url(images/", "url(../img/"))
      .pipe(base64({
        baseDir: "./www/css/",
        extensions: ['png', 'gif', /\.jpg#datauri$/i],
        maxImageSize: 14 * 1024,
        deleteAfterEncoding: false
      }))
      .pipe(gulp.dest('./www/css/'))
      .pipe(cleanCss(cleanCssOptions))
      .pipe(rename({ extname: '.min.css' }))
      .pipe(gulp.dest('./www/css/'))
  );
}

/* --------------------------------------------------------------------------
   -- Build the web (ZIP) artifact
   --------------------------------------------------------------------------*/

function webClean() {
  return del([
    './dist/web/www'
  ]);
}

function webCopyFiles() {
  log(colors.green('Preparing dist/web files...'));
  let htmlminOptions = {removeComments: true, collapseWhitespace: true};

  const debugOptions = { ...debugBaseOptions, title: 'Copying' };

  var targetPath = './dist/web/www';
  return merge(
    // Copy Js (and remove unused code)
    gulp.src('./www/js/**/*.js')
      .pipe(debug(debugOptions))
      .pipe(removeCode({"no-device": true}))
      .pipe(jshint())
      .pipe(gulp.dest(targetPath + '/js')),

    // Copy HTML templates (and remove unused code)
    gulp.src('./www/templates/**/*.html')
      .pipe(removeCode({"no-device": true}))
      .pipe(removeHtml('.hidden-no-device'))
      .pipe(removeHtml('[remove-if][remove-if="no-device"]'))
      .pipe(htmlmin(htmlminOptions))
      .pipe(gulp.dest(targetPath + '/templates')),

    // Copy index.html (and remove unused code)
    gulp.src('./www/index.html')
      .pipe(removeCode({'no-device': true}))
      .pipe(removeHtml('.hidden-no-device'))
      .pipe(removeHtml('[remove-if][remove-if="no-device"]'))
      .pipe(htmlmin(/*no options, to keep comments*/))
      .pipe(gulp.dest(targetPath)),

    // Copy API index.html
    gulp.src('./www/api/index.html')
      .pipe(removeCode({'no-device': true}))
      .pipe(removeHtml('.hidden-no-device'))
      .pipe(removeHtml('[remove-if][remove-if="no-device"]'))
      .pipe(htmlmin())
      .pipe(gulp.dest(targetPath + '/api')),

    // Copy config-test.js
    gulp.src('./www/js/config*.js')
      .pipe(debug(debugOptions))
      .pipe(gulp.dest(targetPath)),

    // Copy fonts
    gulp.src('./www/fonts/**/*.*')
      .pipe(debug(debugOptions))
      .pipe(gulp.dest(targetPath + '/fonts')),

    // Copy CSS
    gulp.src('./www/css/**/*.*')
      .pipe(debug(debugOptions))
      .pipe(gulp.dest(targetPath + '/css')),

    // Copy i18n
    gulp.src('./www/i18n/locale-*.json')
      .pipe(jsonlint())
      .pipe(jsonlint.reporter())
      .pipe(sort())
      .pipe(ngTranslate({standalone:true, module: 'cesium.translations'}))
      .pipe(debug(debugOptions))
      .pipe(gulp.dest(targetPath + '/js')),

    // Copy img
    gulp.src('./www/img/**/*.*')
      .pipe(debug(debugOptions))
      .pipe(gulp.dest(targetPath + '/img')),

    // Copy manifest.json
    gulp.src('./www/manifest.json')
      .pipe(debug(debugOptions))
      .pipe(gulp.dest(targetPath)),

    // Copy lib (JS, CSS and fonts)
    gulp.src(['./www/lib/**/*.js', './www/lib/**/*.css', './www/lib/**/fonts/**/*.*'])
      .pipe(debug(debugOptions))
      .pipe(gulp.dest(targetPath + '/lib')),

    // Copy license into HTML
    gulp.src('./www/license/*.md')
      .pipe(markdown())
      .pipe(header('<html><header><meta charset="utf-8"></header><body>'))
      .pipe(footer('</body></html>'))
      .pipe(gulp.dest(targetPath + '/license')),

    // Copy license into txt
    gulp.src('./www/license/*.md')
      .pipe(header('\ufeff')) // Need BOM character for UTF-8 files
      .pipe(rename({ extname: '.txt' }))
      .pipe(gulp.dest(targetPath + '/license'))
  );
}

function webNgTemplate() {
  var targetPath = './dist/web/www';
  return gulp.src(targetPath + '/templates/**/*.html')
    .pipe(sort())
    .pipe(templateCache({
      standalone: true,
      module: "cesium.templates",
      root: "templates/"
    }))
    .pipe(gulp.dest(targetPath + '/dist/dist_js/app'));
}

function webAppNgAnnotate() {
  var targetPath = './dist/web/www';
  var jsFilter = filter(["**/*.js", "!**/vendor/*"]);

  return gulp.src(targetPath + '/js/**/*.js')
    .pipe(jsFilter)
    .pipe(ngAnnotate({single_quotes: true}))
    .pipe(gulp.dest(targetPath + '/dist/dist_js/app'));
}

function webPluginCopyFiles() {
  const targetPath = './dist/web/www';
  return merge(
    // Copy Js (and remove unused code)
    gulp.src('./www/plugins/**/*.js')
      .pipe(removeCode({"no-device": true}))
      .pipe(jshint())
      .pipe(gulp.dest(targetPath + '/plugins')),

    // Copy HTML templates (and remove unused code)
    gulp.src('./www/plugins/**/*.html')
      .pipe(removeCode({"no-device": true}))
      .pipe(removeHtml('.hidden-no-device'))
      .pipe(removeHtml('[remove-if][remove-if="no-device"]'))
      .pipe(htmlmin())
      .pipe(gulp.dest(targetPath + '/plugins')),

    // Transform i18n into JS
    gulp.src(paths.ng_translate_plugin)
      .pipe(jsonlint())
      .pipe(jsonlint.reporter())
      .pipe(sort())
      .pipe(ngTranslate({standalone:true, module: 'cesium.plugins.translations'}))
      .pipe(gulp.dest(targetPath + '/dist/dist_js/plugins')),

    // Copy plugin CSS
    gulp.src(paths.css_plugin)
      .pipe(gulp.dest(targetPath + '/dist/dist_css/plugins')),

    // Copy Leaflet images
    pluginLeafletImages(targetPath + '/img'),

    // Copy Leaflet CSS
    gulp.src('./www/css/**/leaflet.*')
      .pipe(gulp.dest(targetPath + '/css'))

  );
}

function webPluginNgTemplate() {
  var targetPath = './dist/web/www';
  return gulp.src(targetPath + '/plugins/**/*.html')
    .pipe(sort())
    .pipe(templateCache({
      standalone: true,
      module: "cesium.plugins.templates",
      root: "plugins/"
    }))
    .pipe(gulp.dest(targetPath + '/dist/dist_js/plugins'));
}

function webPluginNgAnnotate() {
  var targetPath = './dist/web/www';
  return gulp.src(targetPath + '/plugins/**/*.js')
    .pipe(ngAnnotate({single_quotes: true}))
    .pipe(gulp.dest(targetPath + '/dist/dist_js/plugins'));
}

function webUglify() {
  const targetPath = './dist/web/www';
  const enableUglify = argv.release || argv.uglify || false;
  const version = JSON.parse(fs.readFileSync('./package.json', 'utf8')).version;

  if (enableUglify) {

    log(colors.green('Minify JS and CSS files...'));

    const indexFilter = filter('**/index.html', {restore: true});
    const jsFilter = filter(["**/*.js", '!**/config.js', '!**/config-test.js'], {restore: true});
    const cssFilter = filter("**/*.css", {restore: true});

    // Process index.html
    return gulp.src(targetPath + '/index.html')
      .pipe(useref({}, lazypipe().pipe(sourcemaps.init, { loadMaps: true })))  // Concatenate with gulp-useref

      // Process JS
      .pipe(jsFilter)
      .pipe(uglify(uglifyBaseOptions)) // Minify javascript files
      .pipe(jsFilter.restore)

      // Process CSS
      .pipe(cssFilter)
      .pipe(csso())               // Minify any CSS sources
      .pipe(cssFilter.restore)

      // Add version to file path
      .pipe(indexFilter)
      .pipe(replace(/"(dist_js\/[a-zA-Z0-9]+).js"/g, '"$1.js?v=' + version + '"'))
      .pipe(replace(/"(dist_css\/[a-zA-Z0-9]+).css"/g, '"$1.css?v=' + version + '"'))
      .pipe(indexFilter.restore)

      .pipe(sourcemaps.write('maps'))

      .pipe(gulp.dest(targetPath));
  }
  else {
    return Promise.resolve();
  }
}

function webIntegrity() {
  const targetPath = './dist/web/www';

  const enableIntegrity = argv.release || false;

  if (enableIntegrity) {
    log(colors.green('Create index.integrity.html... '));

    // Process index.html
    return gulp.src(targetPath + '/index.html', {base: targetPath})

      // Add an integrity hash
      .pipe(sriHash())

      .pipe(rename({ extname: '.integrity.html' }))
      .pipe(gulp.dest(targetPath));
  }
  else {
    return Promise.resolve();
  }
}

function webApiUglify() {
  const targetPath = './dist/web/www';
  const version = JSON.parse(fs.readFileSync('./package.json', 'utf8')).version;

  const jsFilter = filter(["**/*.js", '!**/config.js', '!**/config-test.js'], {restore: true});
  const cssFilter = filter("**/*.css", {restore: true});
  const indexFilter = filter('**/index.html', {restore: true});

  // Skip if not required
  const enableUglify = argv.release || argv.uglify || false;
  if (enableUglify) {
    log(colors.green('API: Minify JS and CSS files...'));

    // Process api/index.html
    return gulp.src(targetPath + '/*/index.html')

      .pipe(useref({}, lazypipe().pipe(sourcemaps.init, { loadMaps: true })))  // Concatenate with gulp-useref

      // Process JS
      .pipe(jsFilter)
      .pipe(uglify(uglifyBaseOptions)) // Minify any javascript sources
      .pipe(jsFilter.restore)

      // Process CSS
      .pipe(cssFilter)
      .pipe(csso()) // Minify any CSS sources
      .pipe(cssFilter.restore)

      .pipe(indexFilter)

      // Add version to files path
      .pipe(replace(/"(dist_js\/[a-zA-Z0-9-.]+).js"/g, '"$1.js?v=' + version + '"'))
      .pipe(replace(/"(dist_css\/[a-zA-Z0-9-.]+).css"/g, '"$1.css?v=' + version + '"'))

      .pipe(replace("dist_js", "../dist_js"))
      .pipe(replace("dist_css", "../dist_css"))
      .pipe(replace("config.js", "../config.js"))
      .pipe(replace("config-test.js", "../config-test.js"))
      .pipe(indexFilter.restore)

      .pipe(sourcemaps.write('maps'))

      .pipe(gulp.dest(targetPath));
  }

  else {
    log(colors.red('API: Skipping minify JS and CSS files') + colors.grey(' (missing options --release or --uglify)'));

    return gulp.src(targetPath + '/*/index.html')
      .pipe(useref())             // Concatenate with gulp-useref

      .pipe(indexFilter)
      .pipe(replace("dist_js", "../dist_js"))
      .pipe(replace("dist_css", "../dist_css"))
      .pipe(replace("config.js", "../config.js"))
      .pipe(replace("config-test.js", "../config-test.js"))
      .pipe(indexFilter.restore)

      .pipe(gulp.dest(targetPath));
  }
}

function webCleanUnusedFiles(done) {
  log(colors.green('Clean unused files...'));
  const targetPath = './dist/web/www';
  const enableUglify = argv.release || argv.uglify || false;
  const cleanSources = enableUglify;
  const debugOptions = {...debugBaseOptions,
    title: 'Deleting',
    showCount: !argv.debug
  };

  if (cleanSources) {
    return merge(
      // Clean core JS
      gulp.src(targetPath + '/js/**/*.js', {read: false})
        .pipe(debug(debugOptions))
        .pipe(clean()),

      // Clean core CSS
      gulp.src(targetPath + '/css/**/*.css', {read: false})
        .pipe(debug(debugOptions))
        .pipe(clean()),

      // Clean plugins JS + CSS
      gulp.src(targetPath + '/plugins/**/*.js', {read: false})
        .pipe(debug(debugOptions))
        .pipe(clean()),
      gulp.src(targetPath + '/plugins/**/*.css', {read: false})
        .pipe(debug(debugOptions))
        .pipe(clean()),

      // Unused maps/config.js.map
      gulp.src(targetPath + '/maps/config.js.map', {read: false, allowEmpty: true})
        .pipe(debug(debugOptions))
        .pipe(clean()),
      gulp.src(targetPath + '/maps/config-test.js.map', {read: false, allowEmpty: true})
        .pipe(debug(debugOptions))
        .pipe(clean())
    )
      .on('end', done);
  }

  if (done) done();
}


function webCleanUnusedDirectories() {
  log(colors.green('Clean unused directories...'));
  const enableUglify = argv.release || argv.uglify || false;
  const debugOptions = { ...debugBaseOptions,
    title: 'Deleting',
    showCount: !argv.debug
  };

  // Clean dir
  const wwwPath = './dist/web/www';

  let patterns = [
    wwwPath + '/templates',
    wwwPath + '/plugins'
  ];

  if (enableUglify) {
    patterns = patterns.concat([
      wwwPath + '/js',
      wwwPath + '/css',
      wwwPath + '/dist',
      wwwPath + '/lib/*',
      //  Keep IonIcons font
      '!' + wwwPath + '/lib/ionic',
      wwwPath + '/lib/ionic/*',
      '!' + wwwPath + '/lib/ionic/fonts',

      //  Keep RobotoDraft font
      '!' + wwwPath + '/lib/robotodraft',
      wwwPath + '/lib/robotodraft/*',
      '!' + wwwPath + '/lib/robotodraft/fonts'
    ]);
  }
  else {
    patterns = patterns.concat([
      wwwPath + '/js/*',
      '!' + wwwPath + '/js/vendor',
      wwwPath + '/dist_css',
      wwwPath + '/dist_js'
    ]);
  }

  return gulp.src(patterns, {read: false, allowEmpty: true})
    .pipe(debug(debugOptions))
    .pipe(clean());
}

function webZip() {
  const tmpPath = './dist/web/www';
  const version = JSON.parse(fs.readFileSync('./package.json', 'utf8')).version;
  const txtFilter = filter(["**/*.txt"], { restore: true });

  return gulp.src(tmpPath + '/**/*.*')

    // Process TXT files: Add the UTF-8 BOM character
    .pipe(txtFilter)
    .pipe(header('\ufeff'))
    .pipe(txtFilter.restore)

    .pipe(zip('cesium-v'+version+'-web.zip'))

    .pipe(gulp.dest('./dist/web/build'));
}

function webExtClean() {
  return del([
    './dist/web/ext',
  ]);
}

function chromeExtClean() {
  return del([
    './dist/web/chrome-ext'
  ]);
}

function webExtCopyFiles() {
  const wwwPath = './dist/web/www';
  const resourcesPath = './resources/web-ext';
  log(colors.green('Copy web extension files...'));

  const version = JSON.parse(fs.readFileSync('./package.json', 'utf8')).version;
  const manifestFilter = filter(["**/manifest.json"], { restore: true });
  const txtFilter = filter(["**/*.txt"], { restore: true });

  // Copy files
  return gulp.src([
    wwwPath + '/**/*',

    // Skip API files
    '!' + wwwPath + '/api',
    '!' + wwwPath + '/dist_js/*-api.js',
    '!' + wwwPath + '/dist_css/*-api.css',
    '!' + wwwPath + '/maps/dist_js/*-api.js.map',
    '!' + wwwPath + '/maps/dist_css/*-api.css.map',

    // Skip web manifest
    '!' + wwwPath + '/manifest.json',

    // Add specific resource (and overwrite the default 'manifest.json')
    resourcesPath + '/**/*.*'
  ])

  // Process TXT files: Add the UTF-8 BOM character
  .pipe(txtFilter)
  .pipe(header('\ufeff'))
  .pipe(txtFilter.restore)

  // Replace version in 'manifest.json' file
  .pipe(manifestFilter)
  .pipe(replace(/\"version\": \"[^\"]*\"/, '"version": "' + version + '"'))
  .pipe(manifestFilter.restore)

  .pipe(gulp.dest('./dist/web/ext'));
}

function chromeExtCopyFiles() {
  const wwwPath = './dist/web/www';
  const resourcesPath = './resources/chrome-ext';
  log(colors.green('Copy chrome extension files...'));

  const version = JSON.parse(fs.readFileSync('./package.json', 'utf8')).version;
  const manifestFilter = filter(["**/manifest.json"], { restore: true });
  const txtFilter = filter(["**/*.txt"], { restore: true });

  // Copy files
  return gulp.src([
    wwwPath + '/**/*',

    // Skip API files
    '!' + wwwPath + '/api',
    '!' + wwwPath + '/dist_js/*-api.js',
    '!' + wwwPath + '/dist_css/*-api.css',
    '!' + wwwPath + '/maps/dist_js/*-api.js.map',
    '!' + wwwPath + '/maps/dist_css/*-api.css.map',

    // Skip web manifest
    '!' + wwwPath + '/manifest.json',

    // Add specific resources (and overwrite the default 'manifest.json')
    resourcesPath + '/**/*.*'
  ])

  // Process TXT files: Add the UTF-8 BOM character
  .pipe(txtFilter)
  .pipe(header('\ufeff'))
  .pipe(txtFilter.restore)

  // Replace version in 'manifest.json' file
  .pipe(manifestFilter)
  .pipe(replace(/\"version\": \"[^\"]*\"/, '"version": "' + version + '"'))
  .pipe(manifestFilter.restore)

  .pipe(gulp.dest('./dist/web/chrome-ext'));
}

function webExtZip() {
  const srcPath = './dist/web/ext';
  const distPath = './dist/web/build';
  const version = JSON.parse(fs.readFileSync('./package.json', 'utf8')).version;

  return gulp.src(srcPath + '/**/*.*')
    .pipe(zip('cesium-v'+version+'-extension.zip'))
    .pipe(gulp.dest(distPath));
}

function chromeExtZip() {
  const srcPath = './dist/web/chrome-ext';
  const distPath = './dist/web/build';
  const version = JSON.parse(fs.readFileSync('./package.json', 'utf8')).version;

  return gulp.src(srcPath + '/**/*.*')
    .pipe(zip('cesium-v'+version+'-extension-chrome.zip'))
    .pipe(gulp.dest(distPath));
}

function webBuildSuccess(done) {
  var version = JSON.parse(fs.readFileSync('./package.json', 'utf8')).version;
  log(colors.green("Web artifact created at: 'dist/web/build/cesium-v" + version + "-web.zip'"));
  if (done) done();
}

function webExtBuildSuccess(done) {
  var version = JSON.parse(fs.readFileSync('./package.json', 'utf8')).version;
  log(colors.green("Web extension artifact created at: 'dist/web/build/cesium-v" + version + "-extension.zip'"));
  if (done) done();
}

function chromeExtBuildSuccess(done) {
  var version = JSON.parse(fs.readFileSync('./package.json', 'utf8')).version;
  log(colors.green("Web extension artifact created at: 'dist/web/build/cesium-v" + version + "-extension-chrome.zip'"));
  if (done) done();
}

function cdvAddPlatformToBodyTag() {
  log(colors.green('Add platform CSS class to <body>... '));

  const projectRoot = argv.root || '.';
  const platform = argv.platform || 'android';
  let wwwPath;
  if (platform === 'android') {
    wwwPath = path.join(projectRoot, 'platforms', platform, 'app','src','main','assets','www');
  } else {
    wwwPath = path.join(projectRoot, 'platforms', platform, 'www');
  }
  const indexPath = path.join(wwwPath, 'index.html');

  // no opening body tag, something's wrong
  if (!fs.existsSync(indexPath)) throw new Error('Unable to find the file ' + indexPath +'!');

  // add the platform class to the body tag
  try {
    const platformClass = 'platform-' + platform;
    const cordovaClass = 'platform-cordova platform-webview';

    let html = fs.readFileSync(indexPath, 'utf8');

    // get the body tag
    let matches = html && html.match(/<body[^>/]+>/gi)
    const bodyTag = matches && matches[0];
    // no opening body tag, something's wrong
    if (!bodyTag) throw new Error('No <body> element found in file ' + indexPath);

    if (bodyTag.indexOf(platformClass) > -1) return; // already added

    let newBodyTag = '' + bodyTag;
    matches = bodyTag.match(/ class=["|'](.*?)["|']/gi);
    const classAttr = matches && matches[0];
    if (classAttr) {
      // body tag has existing class attribute, add the classname
      let endingQuote = classAttr.substring(classAttr.length - 1);
      let newClassAttr = classAttr.substring(0, classAttr.length - 1);
      newClassAttr += ' ' + platformClass + ' ' + cordovaClass + endingQuote;
      newBodyTag = newBodyTag.replace(classAttr, newClassAttr);

    } else {
      // add class attribute to the body tag
      newBodyTag = newBodyTag.replace('>', ' class="' + platformClass + ' ' + cordovaClass + '">');
    }

    html = html.replace(bodyTag, newBodyTag);

    fs.writeFileSync(indexPath, html, 'utf8');

    return Promise.resolve();
  } catch (e) {
    return Promise.reject(e);
  }
}

function cdvNgAnnotate() {
  log(colors.green('Building JS files... '));

  const projectRoot = argv.root || '.';
  const platform = argv.platform || 'android';
  let wwwPath;
  if (platform === 'android') {
    wwwPath = path.join(projectRoot, 'platforms', platform, 'app','src','main','assets','www');
  } else {
    wwwPath = path.join(projectRoot, 'platforms', platform, 'www');
  }

  const jsFilter = filter(["**/*.js", "!**/vendor/*"]);

  return merge(

    // Ng annotate app JS file
    gulp.src(wwwPath + '/js/**/*.js')
      .pipe(jsFilter)
      .pipe(ngAnnotate({single_quotes: true}))
      .pipe(gulp.dest(wwwPath + '/dist/dist_js/app')),

    // Ng annotate app JS file
    gulp.src(wwwPath + '/plugins/**/*.js')
      .pipe(ngAnnotate({single_quotes: true}))
      .pipe(gulp.dest(wwwPath + '/dist/dist_js/plugins'))

  );
}

function cdvRemoveCode() {
  log(colors.green('Removing code... '));

  const projectRoot = argv.root || '.';
  const platform = argv.platform || 'android';
  let wwwPath;
  if (platform === 'android') {
    wwwPath = path.join(projectRoot, 'platforms', platform, 'app','src','main','assets','www');
  } else {
    wwwPath = path.join(projectRoot, 'platforms', platform, 'www');
  }

  const appJsPath = [path.join(wwwPath, 'js', '**', '*.js'),
      // Exclude vendor libs
      "!" + path.join(wwwPath, 'js', 'vendor', '**', '*.js')];
  const pluginPath = path.join(wwwPath, 'plugins', '*');
  const pluginJsPath = path.join(pluginPath, '**', '*.js');

  // Compute options {device-<platform>: true}
  let removeCodeOptions = {};
  removeCodeOptions[platform] = true; // = {<platform>: true}

  const htmlminOptions = {removeComments: true, collapseWhitespace: true};
  const debugOptions = {...debugBaseOptions,
    showCount: false
  };

  // Do not remove desktop code for iOS and macOS (support for tablets and desktop macs)
  if (platform !== 'ios' && platform !== 'osx') {
    // Removing unused code for device...
    return merge(
      // Remove unused HTML tags
      gulp.src(path.join(wwwPath, 'templates', '**', '*.html'))
        .pipe(debug(debugOptions))
        .pipe(removeCode({device: true}))
        .pipe(removeCode(removeCodeOptions))
        .pipe(removeHtml('.hidden-xs.hidden-sm'))
        .pipe(removeHtml('.hidden-device'))
        .pipe(removeHtml('[remove-if][remove-if="device"]'))
        .pipe(htmlmin(htmlminOptions))
        .pipe(gulp.dest(wwwPath + '/templates')),

      gulp.src(path.join(pluginPath, '**', '*.html'))
        .pipe(debug(debugOptions))
        .pipe(removeCode({device: true}))
        .pipe(removeCode(removeCodeOptions))
        .pipe(removeHtml('.hidden-xs.hidden-sm'))
        .pipe(removeHtml('.hidden-device'))
        .pipe(removeHtml('[remove-if][remove-if="device"]'))
        .pipe(htmlmin(htmlminOptions))
        .pipe(gulp.dest(pluginPath)),

      gulp.src(path.join(wwwPath, 'index.html'))
        .pipe(debug(debugOptions))
        .pipe(removeCode({device: true}))
        .pipe(removeCode(removeCodeOptions))
        .pipe(removeHtml('.hidden-xs.hidden-sm'))
        .pipe(removeHtml('.hidden-device'))
        .pipe(removeHtml('[remove-if][remove-if="device"]'))
        .pipe(htmlmin(/*no options, to keep comments*/))
        .pipe(gulp.dest(wwwPath)),

      // Remove unused JS code + add ng annotations
      gulp.src(appJsPath)
        .pipe(debug(debugOptions))
        .pipe(removeCode({device: true}))
        .pipe(removeCode(removeCodeOptions))
        .pipe(ngAnnotate({single_quotes: true}))
        .pipe(gulp.dest(wwwPath + '/dist/dist_js/app')),

      gulp.src(pluginJsPath)
        .pipe(debug(debugOptions))
        .pipe(removeCode({device: true}))
        .pipe(removeCode(removeCodeOptions))
        .pipe(ngAnnotate({single_quotes: true}))
        .pipe(gulp.dest(wwwPath + '/dist/dist_js/plugins'))
    );
  } else {
    return merge(
      gulp.src(path.join(wwwPath, 'templates', '**', '*.html'))
        .pipe(debug(debugOptions))
        .pipe(htmlmin(htmlminOptions))
        .pipe(gulp.dest(wwwPath + '/templates')),

      gulp.src(path.join(pluginPath, '**', '*.html'))
        .pipe(debug(debugOptions))
        .pipe(htmlmin(htmlminOptions))
        .pipe(gulp.dest(pluginPath)),

      gulp.src(path.join(wwwPath, 'index.html'))
        .pipe(gulp.dest(wwwPath)),

      gulp.src(appJsPath)
        .pipe(debug(debugOptions))
        .pipe(ngAnnotate({single_quotes: true}))
        .pipe(gulp.dest(wwwPath + '/dist/dist_js/app')),

      gulp.src(pluginJsPath)
        .pipe(debug(debugOptions))
        .pipe(gulp.dest(wwwPath + '/dist/dist_js/plugins'))
    );
  }
}

function cdvNgTemplate() {
  log(colors.green('Building template files...'));

  const projectRoot = argv.root || '.';
  const platform = argv.platform || 'android';

  let wwwPath;
  if (platform === 'android') {
    wwwPath = path.join(projectRoot, 'platforms', platform, 'app','src','main','assets','www');
  } else {
    wwwPath = path.join(projectRoot, 'platforms', platform, 'www');
  }
  let distJsPath = path.join(wwwPath, 'dist', 'dist_js', 'app');
  let pluginDistJsPath = path.join(wwwPath, 'dist', 'dist_js', 'plugins');
  const debugOptions = { ...debugBaseOptions,
    showCount: false
  };

  // Concat templates into a JS
  return merge(
    gulp.src(path.join(wwwPath, 'templates', '**', '*.html'))
      .pipe(debug(debugOptions))
      .pipe(templateCache({
        standalone: true,
        module: "cesium.templates",
        root: "templates/"
      }))
      .pipe(gulp.dest(distJsPath)),

    gulp.src(path.join(wwwPath, 'plugins', '*', 'templates', '**', '*.html'))
      .pipe(debug(debugOptions))
      .pipe(templateCache({
        standalone: true,
        module: "cesium.plugins.templates",
        root: "plugins/"
      }))
      .pipe(gulp.dest(pluginDistJsPath))
  );
}
function cdvNgTranslate() {
  log(colors.green('Building translation files...'));

  const projectRoot = argv.root || '.';
  const platform = argv.platform || 'android';

  let wwwPath;
  if (platform === 'android') {
    wwwPath = path.join(projectRoot, 'platforms', platform, 'app', 'src', 'main', 'assets', 'www');
  } else {
    wwwPath = path.join(projectRoot, 'platforms', platform, 'www');
  }
  let distJsPath = path.join(wwwPath, 'dist', 'dist_js', 'app');
  let pluginDistJsPath = path.join(wwwPath, 'dist', 'dist_js', 'plugins');

  const debugOptions = {
    title: 'Processing',
    minimal: true,
    showFiles: argv.debug || false,
    showCount: false,
    logger: m => log(colors.grey(m))
  };

  // Concat templates into a JS
  return merge(
      gulp.src(wwwPath + '/i18n/locale-*.json')
        .pipe(debug(debugOptions))
        .pipe(ngTranslate({standalone: true, module: 'cesium.translations'}))
        .pipe(gulp.dest(distJsPath)),

      gulp.src(wwwPath + '/plugins/*/i18n/locale-*.json')
        .pipe(debug(debugOptions))
        .pipe(ngTranslate({standalone: true, module: 'cesium.plugins.translations'}))
        .pipe(gulp.dest(pluginDistJsPath))
    );
}

function cdvUglify() {

  const projectRoot = argv.root || '.';
  const platform = argv.platform || 'android';

  let wwwPath;
  if (platform === 'android') {
    wwwPath = path.join(projectRoot, 'platforms', platform, 'app', 'src', 'main', 'assets', 'www');
  } else {
    wwwPath = path.join(projectRoot, 'platforms', platform, 'www');
  }
  let indexPath = path.join(wwwPath, 'index.html');

  // Skip if not required
  const enableUglify = argv.release || argv.uglify || false;
  if (enableUglify) {
    log(colors.green('Minify JS and CSS files...'));

    // WARN: uglify only libs, to keep sources readable (need by free repo)
    const jsLibFilter = filter(['*/lib/**/*.js', '*/js/vendor/**/*.js'], {restore: true}); // External libs only
    const cssFilter = filter("**/*.css", {restore: true});
    const cdvUglifyOptions = {
      ...uglifyBaseOptions,
      ecma: '5'
    };
    const debugOptions = { ...debugBaseOptions,
      title: 'Minifying',
      showCount: false
    };

    return gulp.src(indexPath)
      .pipe(useref())             // Concatenate with gulp-useref

      // Process JS
      .pipe(jsLibFilter)
      .pipe(debug(debugOptions))
      .pipe(uglify(cdvUglifyOptions))// Minify javascript sources
      .pipe(jsLibFilter.restore)

      // Process CSS
      .pipe(cssFilter)
      .pipe(debug(debugOptions))
      .pipe(csso())               // Minify any CSS sources
      .pipe(cssFilter.restore)

      .pipe(gulp.dest(wwwPath));
  }
  else {
    log(colors.red('Skipping minify JS and CSS files') + colors.grey(' (missing options --release or --uglify)'));
    return Promise.resolve();
  }
}

function cdvCleanUnusedDirectories() {
  log(colors.green('Clean unused directories...'));

  const projectRoot = argv.root || '.';
  const platform = argv.platform || 'android';

  let wwwPath;
  if (platform === 'android') {
    wwwPath = path.join(projectRoot, 'platforms', platform, 'app', 'src', 'main', 'assets', 'www');
  } else {
    wwwPath = path.join(projectRoot, 'platforms', platform, 'www');
  }

  const enableUglify = argv.release || argv.uglify || false;
  const debugOptions = {
    title: 'Deleting',
    minimal: true,
    showFiles: argv.debug || false,
    showCount: !argv.debug,
    logger: m => log(colors.grey(m))
  };

  let patterns = [
    wwwPath + '/api',

    // Remove HTML templates - replaced by ngTemplate()
    wwwPath + '/templates',

    // Remove Cesium plugins
    // (WARN: remove one by one, to keep Cordova plugins)
    wwwPath + '/plugins/es',
    wwwPath + '/plugins/graph',
    wwwPath + '/plugins/map',
    wwwPath + '/plugins/rml9',

    // Remove translations - replaced by ngTranslate()
    wwwPath + '/**/i18n',
  ];

  if (enableUglify) {
    patterns = patterns.concat([
      wwwPath + '/js',
      wwwPath + '/css', // Have been replaced by useref(), into 'dist_css'
      wwwPath + '/dist', // Have been replaced by useref(), into 'dist_js'
      wwwPath + '/cordova-js-src',

      // Clean lib directory...
      wwwPath + '/lib/*',

      // ...but Keep IonIcons font
      '!' + wwwPath + '/lib/ionic',
      wwwPath + '/lib/ionic/*',
      '!' + wwwPath + '/lib/ionic/fonts',

      // ...but Keep RobotoDraft font
      '!' + wwwPath + '/lib/robotodraft',
      wwwPath + '/lib/robotodraft/*',
      '!' + wwwPath + '/lib/robotodraft/fonts'
    ]);
  }
  else {
    patterns = patterns.concat([
      wwwPath + '/js/*', // Have been replace into dist/dist_js
      '!' + wwwPath + '/js/vendor', // BUT keep vendor lib
    ]);
  }

  return gulp.src(patterns, {read: false, allowEmpty: true})
    .pipe(debug(debugOptions))
    .pipe(clean());
}


function cdvCopyBuildFiles() {
  log(colors.green('Copy build files... '));

  const projectRoot = argv.root || '.';
  const platform = argv.platform || 'android';

  const srcPath = path.join(projectRoot, 'resources', platform, 'build');
  const targetPath = path.join(projectRoot, 'platforms', platform);
  const debugOptions = { ...debugBaseOptions, title: 'Copying',
    showFiles: argv.debug || false,
    showCount: !argv.debug
  };

  if (fs.existsSync(srcPath)) {
    return gulp.src(srcPath + '/**/*.*')
      .pipe(debug(debugOptions))
      .pipe(gulp.dest(targetPath));
  }
  else {
    log(colors.blue(' Directory ' + srcPath + 'not found. Skipping copy to ' + targetPath));
    return Promise.resolve();
  }
}

function cdvAndroidManifest() {

  const projectRoot = argv.root || '.';
  const platform = argv.platform || 'android';
  if (platform !== 'android') return Promise.resolve(); // Skip

  const srcMainPath = path.join(projectRoot, 'platforms', platform, 'app', 'src', 'main');
  const androidManifestFile = path.join(srcMainPath, 'AndroidManifest.xml');

  log(colors.green('Patch Android manifest... ') + colors.grey(androidManifestFile));

  if (!fs.existsSync(androidManifestFile)) {
    throw Error("Missing required file " + androidManifestFile);
  }

  return gulp.src(androidManifestFile)

    // Add 'tools' namespace to root tag
    .pipe(replace(/(xmlns:android="http:\/\/schemas.android.com\/apk\/res\/android")\s*>/g, '$1 xmlns:tools="http://schemas.android.com/tools">'))

    // Use AndroidX
    .pipe(replace(/\s+tools:replace="android:appComponentFactory"/, ''))
    .pipe(replace(/\s+android:appComponentFactory="[^"]+"/, ''))
    .pipe(replace(/(\s*<application)\s*/, '$1 tools:replace="android:appComponentFactory" android:appComponentFactory="androidx.core.app.CoreComponentFactory" '))

    // remove all <uses-sdk>
    .pipe(replace(/<uses-sdk [^>]+\/>/g, ''))

    // add <uses-sdk> (tools:overrideLibrary)
    .pipe(replace(/(<\/manifest>)/, '    <uses-sdk tools:overrideLibrary="org.kaliumjni.lib,org.apache.cordova" />\n$1'))

    // Add URI scheme web+june
    // Patch invalid intent-filter (should be a bug of cordova-plugin-customurlschema)
    // FIXME : this cause too many intent-filter are appended, on each build
    //.pipe(replace('<data android:host=" " android:pathPrefix="/" android:scheme=" " />', '<data android:scheme="web+june" />'))

    .pipe(gulp.dest(srcMainPath));
}

function cdvAndroidCheckSigning() {

  const projectRoot = argv.root || '.';
  const platform = argv.platform || 'android';
  if (platform !== 'android') return Promise.resolve(); // Skip

  const targetPath = path.join(projectRoot, 'platforms', platform);
  const signingFile = path.join(targetPath, 'release-signing.properties');

  // Check signing file exists
  if (fs.existsSync(targetPath) && !fs.existsSync(signingFile)) {
    log(colors.blue('WARNING: Missing file ' + signingFile));
    log(colors.blue('  Please create it manually, otherwise release APK files will NOT be signed! '));
  }

  return Promise.resolve();
}

function cdvAsHook(wrapper) {

  return (done, projectRoot, platform) => {
    projectRoot = (typeof projectRoot === 'string' && projectRoot) || argv.root || '.';
    platform = ((typeof platform === 'string' && platform) || argv.platform || 'android').toLowerCase();

    // Override arguments, to pass it to other tasks
    argv.root = projectRoot;
    argv.platform = platform;

    wrapper(done);
  }
}

function help() {
  log(colors.green("Usage: gulp {config|webBuild|webExtBuild} OPTIONS"));
  log(colors.green(""));
  log(colors.green("NAME"));
  log(colors.green(""));
  log(colors.green("  config --env <config_name>  Configure environment (create file `www/config.js`). "));
  log(colors.green("  build                       Build from sources (CSS and JS)"));
  log(colors.green("  webBuild                    Build ZIP artifact"));
  log(colors.green("  webExtBuild                 Build web extension artifact (browser module)"));
  log(colors.green(""));
  log(colors.green("OPTIONS"));
  log(colors.green(""));
  log(colors.green("  --release                   Release build (with uglify and sourcemaps)"));
  log(colors.green("  --uglify                    Build using uglify plugin"));
}

/* --------------------------------------------------------------------------
   -- Combine task
   --------------------------------------------------------------------------*/
const translate = gulp.series(appNgTranslate, pluginNgTranslate);
const template = gulp.series(appNgTemplate, pluginNgTemplate);
const appAndPluginSass = gulp.series(appSass, pluginSass);
const app = gulp.series(appSass, appNgTemplate, appNgAnnotate, appNgTranslate);
const plugin = gulp.series(pluginSass, pluginNgTemplate, pluginNgAnnotate, pluginNgTranslate);
const build = gulp.series(appLicense, app, plugin);
const config = gulp.series(appConfig, appConfigTest);

const webApp = gulp.series(appSass, webCopyFiles, webNgTemplate, webAppNgAnnotate);
const webPlugin = gulp.series(pluginSass, webPluginCopyFiles, webPluginNgTemplate, webPluginNgAnnotate);
const webCompile = gulp.series(
  webClean,
  webApp,
  webPlugin,
  webUglify,
  webIntegrity,
  webApiUglify,
  webCleanUnusedFiles,
  webCleanUnusedDirectories
);

// note : Do not call config, to keep same config between web and webExt artifacts
const webBuild = gulp.series(
  webClean,
  webCompile,
  webZip,
  webBuildSuccess
);
const webExtCompile = gulp.series(
  webExtClean,
  webCompile,
  webExtCopyFiles
);

const chromeExtCompile = gulp.series(
  chromeExtClean,
  webCompile,
  chromeExtCopyFiles
);

// note : Do not call config, to keep same config between web and webExt artifacts
const webExtBuild = gulp.series(
  webExtCompile,
  webExtZip,
  webExtBuildSuccess
);

const chromeExtBuild = gulp.series(
  chromeExtCompile,
  chromeExtZip,
  chromeExtBuildSuccess
);



/* --------------------------------------------------------------------------
   -- Define public tasks
   --------------------------------------------------------------------------*/

exports.help = help;
exports.config = config;
exports.license = appLicense;
exports.sass = appAndPluginSass;
exports.translate = translate;
exports.template = template;
exports.clean = appAndPluginClean;
exports.lint = appAndPluginLint;
exports.annotate = gulp.series(appNgAnnotate, pluginNgAnnotate);
exports.watch = appAndPluginWatch;
exports.build = build;

// Web
exports.webClean = webClean;
exports.webCompile = webCompile;
exports.webBuild = webBuild;
exports['build:web'] = exports.webBuild; // Alias

// Web extension
exports.webExtClean = webExtClean;
exports.webExtCompile = webExtCompile;
exports.webExtBuild = webExtBuild;
exports.webExtCopyFiles = webExtCopyFiles;
exports['build:webExt'] = exports.webExtBuild; // Alias

// Chrome extension
exports.chromeExtBuild = chromeExtBuild;
exports['build:chromeExt'] = exports.chromeExtBuild; // Alias

// Cordova (hooks)
const cdvAfterPrepare = gulp.series(
  gulp.parallel(cdvNgAnnotate, cdvAddPlatformToBodyTag),
  cdvRemoveCode,
  gulp.parallel(cdvNgTemplate, cdvNgTranslate),
  cdvUglify,
  gulp.parallel(cdvCleanUnusedDirectories, cdvCopyBuildFiles),
  // Android tasks
  gulp.parallel(cdvAndroidManifest, cdvAndroidCheckSigning),
);
exports.cdvAfterPrepare = cdvAsHook(cdvAfterPrepare);

const cdvBeforeCompile = gulp.series(
  cdvCleanUnusedDirectories,
  cdvCopyBuildFiles,
  cdvAndroidManifest,
  cdvAndroidCheckSigning
);
exports.cdvBeforeCompile = cdvAsHook(cdvBeforeCompile);

exports.default = gulp.series(config, build);
exports.serveBefore = gulp.series(build, appAndPluginWatch);
exports['ionic:serve:before'] = exports.serveBefore; // Alias need by @ionic/cli
