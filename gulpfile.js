'use strict';

const gulp = require('gulp'),
  sass = require('gulp-sass'),
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
  es = require('event-stream'),
  zip = require('gulp-zip'),
  del = require('del'),
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
  argv = require('yargs').argv,
  sriHash = require('gulp-sri-hash'),
  sort = require('gulp-sort'),
  jsonlint = require("@prantlf/gulp-jsonlint");

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
    .pipe(cleanCss({
      keepSpecialComments: 0
    }))
    .pipe(rename({ extname: '.min.css' }))
    .pipe(gulp.dest('./www/css/'));
}

function appConfig() {
  const allConfig = JSON.parse(fs.readFileSync('./app/config.json', 'utf8'));

  // Determine which environment to use when building config.
  const env = argv.env || 'default';
  const config = allConfig[env];

  if(!config) {
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

function appNgTemplate() {
  log(colors.green('Building App template file...'));

  return gulp.src(paths.templatecache)
    .pipe(sort())
    .pipe(templateCache({
      standalone: true,
      module:"cesium.templates",
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
  log(colors.green('Building App translation file...'));

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
      standalone:true,
      module:"cesium.plugins.templates",
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
      .pipe(gulp.dest('./www/dist/dist_js/app' + path))
      ;
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
  dest = dest || './www/img/';
  // Leaflet images
  return gulp.src(['scss/leaflet/images/*.*',
    'www/lib/leaflet/dist/images/*.*',
    'www/lib/leaflet-search/images/*.*',
    '!www/lib/leaflet-search/images/back.png',
    '!www/lib/leaflet-search/images/leaflet-search.jpg',
    'www/lib/leaflet.awesome-markers/dist/images/*.*'])
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
      .pipe(cleanCss({
        keepSpecialComments: 0
      }))
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

  var tmpPath = './dist/web/www';
  return merge(
    // Copy Js (and remove unused code)
    gulp.src('./www/js/**/*.js')
      .pipe(removeCode({"no-device": true}))
      .pipe(jshint())
      .pipe(gulp.dest(tmpPath + '/js')),

    // Copy HTML templates (and remove unused code)
    gulp.src('./www/templates/**/*.html')
      .pipe(removeCode({"no-device": true}))
      .pipe(removeHtml('.hidden-no-device'))
      .pipe(removeHtml('[remove-if][remove-if="no-device"]'))
      .pipe(htmlmin(htmlminOptions))
      .pipe(gulp.dest(tmpPath + '/templates')),

    // Copy index.html (and remove unused code)
    gulp.src('./www/index.html')
      .pipe(removeCode({'no-device': true}))
      .pipe(removeHtml('.hidden-no-device'))
      .pipe(removeHtml('[remove-if][remove-if="no-device"]'))
      .pipe(htmlmin(/*no options, to keep comments*/))
      .pipe(gulp.dest(tmpPath)),

    // Copy API index.html
    gulp.src('./www/api/index.html')
      .pipe(removeCode({'no-device': true}))
      .pipe(removeHtml('.hidden-no-device'))
      .pipe(removeHtml('[remove-if][remove-if="no-device"]'))
      .pipe(htmlmin())
      .pipe(gulp.dest(tmpPath + '/api')),

    // Copy fonts
    gulp.src('./www/fonts/**/*.*')
      .pipe(gulp.dest(tmpPath + '/fonts')),

    // Copy CSS
    gulp.src('./www/css/**/*.*')
      .pipe(gulp.dest(tmpPath + '/css')),

    // Copy i18n
    gulp.src('./www/i18n/locale-*.json')
      .pipe(jsonlint())
      .pipe(jsonlint.reporter())
      .pipe(sort())
      .pipe(ngTranslate({standalone:true, module: 'cesium.translations'}))
      .pipe(gulp.dest(tmpPath + '/js')),

    // Copy img
    gulp.src('./www/img/**/*.*')
      .pipe(gulp.dest(tmpPath + '/img')),

    // Copy manifest.json
    gulp.src('./www/manifest.json')
      .pipe(gulp.dest(tmpPath)),

    // Copy lib (JS, CSS and fonts)
    gulp.src(['./www/lib/**/*.js', './www/lib/**/*.css', './www/lib/**/fonts/**/*.*'])
      .pipe(gulp.dest(tmpPath + '/lib')),

    // Copy license into HTML
    gulp.src('./www/license/*.md')
      .pipe(markdown())
      .pipe(header('<html><header><meta charset="utf-8"></header><body>'))
      .pipe(footer('</body></html>'))
      .pipe(gulp.dest(tmpPath + '/license')),

    // Copy license into txt
    gulp.src('./www/license/*.md')
      .pipe(header('\ufeff')) // Need BOM character for UTF-8 files
      .pipe(rename({ extname: '.txt' }))
      .pipe(gulp.dest(tmpPath + '/license'))
  );
}

function webNgTemplate() {
  var tmpPath = './dist/web/www';
  return gulp.src(tmpPath + '/templates/**/*.html')
    .pipe(sort())
    .pipe(templateCache({
      standalone:true,
      module:"cesium.templates",
      root: "templates/"
    }))
    .pipe(gulp.dest(tmpPath + '/dist/dist_js/app'));
}

function webAppNgAnnotate() {
  var tmpPath = './dist/web/www';
  var jsFilter = filter(["**/*.js", "!**/vendor/*"]);

  return gulp.src(tmpPath + '/js/**/*.js')
    .pipe(jsFilter)
    .pipe(ngAnnotate({single_quotes: true}))
    .pipe(gulp.dest(tmpPath + '/dist/dist_js/app'));
}

function webPluginCopyFiles() {
  const tmpPath = './dist/web/www';
  return merge(
    // Copy Js (and remove unused code)
    gulp.src('./www/plugins/**/*.js')
      .pipe(removeCode({"no-device": true}))
      .pipe(jshint())
      .pipe(gulp.dest(tmpPath + '/plugins')),

    // Copy HTML templates (and remove unused code)
    gulp.src('./www/plugins/**/*.html')
      .pipe(removeCode({"no-device": true}))
      .pipe(removeHtml('.hidden-no-device'))
      .pipe(removeHtml('[remove-if][remove-if="no-device"]'))
      .pipe(htmlmin())
      .pipe(gulp.dest(tmpPath + '/plugins')),

    // Transform i18n into JS
    gulp.src(paths.ng_translate_plugin)
      .pipe(jsonlint())
      .pipe(jsonlint.reporter())
      .pipe(sort())
      .pipe(ngTranslate({standalone:true, module: 'cesium.plugins.translations'}))
      .pipe(gulp.dest(tmpPath + '/dist/dist_js/plugins')),

    // Copy plugin CSS
    gulp.src(paths.css_plugin)
      .pipe(gulp.dest(tmpPath + '/dist/dist_css/plugins')),

    // Copy Leaflet images
    pluginLeafletImages(tmpPath + '/img'),

    // Copy Leaflet CSS
    gulp.src('./www/css/**/leaflet.*')
      .pipe(gulp.dest(tmpPath + '/css'))

  );
}

function webPluginNgTemplate() {
  var tmpPath = './dist/web/www';
  return gulp.src(tmpPath + '/plugins/**/*.html')
    .pipe(sort())
    .pipe(templateCache({
      standalone:true,
      module:"cesium.plugins.templates",
      root: "plugins/"
    }))
    .pipe(gulp.dest(tmpPath + '/dist/dist_js/plugins'));
}

function webPluginNgAnnotate() {
  var tmpPath = './dist/web/www';
  return gulp.src(tmpPath + '/plugins/**/*.js')
    .pipe(ngAnnotate({single_quotes: true}))
    .pipe(gulp.dest(tmpPath + '/dist/dist_js/plugins'));
}

function webUglify(done) {
  const wwwPath = './dist/web/www';
  const enableUglify = argv.release || argv.uglify || false;
  const version = JSON.parse(fs.readFileSync('./package.json', 'utf8')).version;

  if (enableUglify) {

    log(colors.green('Minify JS and CSS files...'));

    const indexFilter = filter('**/index.html', {restore: true});
    const jsFilter = filter(["**/*.js", '!**/config.js'], {restore: true});
    const cssFilter = filter("**/*.css", {restore: true});
    const uglifyOptions = {
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

    // Process index.html
    return gulp.src(wwwPath + '/index.html')
      .pipe(useref({}, lazypipe().pipe(sourcemaps.init, { loadMaps: true })))  // Concatenate with gulp-useref

      // Process JS
      .pipe(jsFilter)
      .pipe(uglify(uglifyOptions)) // Minify javascript files
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

      .pipe(gulp.dest(wwwPath))
      .on('end', done);
  }

  if (done) done();
}

function webIntegrity() {
  const wwwPath = './dist/web/www';

  log(colors.green('Add integrity hash to <script src> tag...'));

  // Process index.html
  return gulp.src(wwwPath + '/index.html', {base: wwwPath})

    // Add an integrity hash
    .pipe(sriHash())
    .pipe(rename({ extname: '.integrity.html' }))
    .pipe(gulp.dest(wwwPath));
}

function webApiUglify() {
  const tmpPath = './dist/web/www';
  const version = JSON.parse(fs.readFileSync('./package.json', 'utf8')).version;

  const jsFilter = filter(["**/*.js", '!**/config.js'], {restore: true});
  const cssFilter = filter("**/*.css", {restore: true});
  const indexFilter = filter('**/index.html', {restore: true});

  // Skip if not required
  const enableUglify = argv.release || argv.useref || argv.uglify || false;
  if (enableUglify) {
    log(colors.green('API: Minify JS and CSS files...'));
    const uglifyOptions = {
      toplevel: true,
      warnings: true,
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

    // Process api/index.html
    return gulp.src(tmpPath + '/*/index.html')

      .pipe(useref({}, lazypipe().pipe(sourcemaps.init, { loadMaps: true })))  // Concatenate with gulp-useref

      // Process JS
      .pipe(jsFilter)
      .pipe(uglify(uglifyOptions)) // Minify any javascript sources
      .pipe(jsFilter.restore)

      // Process CSS
      .pipe(cssFilter)
      .pipe(csso())               // Minify any CSS sources
      .pipe(cssFilter.restore)

      .pipe(indexFilter)

      // Add version to files path
      .pipe(replace(/"(dist_js\/[a-zA-Z0-9-.]+).js"/g, '"$1.js?v=' + version + '"'))
      .pipe(replace(/"(dist_css\/[a-zA-Z0-9-.]+).css"/g, '"$1.css?v=' + version + '"'))

      .pipe(replace("dist_js", "../dist_js"))
      .pipe(replace("dist_css", "../dist_css"))
      .pipe(replace("config.js", "../config.js"))
      .pipe(indexFilter.restore)

      .pipe(sourcemaps.write('maps'))

      .pipe(gulp.dest(tmpPath));
  }

  else {
    log(colors.red('API: Minify JS and CSS files. Skip') + colors.grey(' (missing options --release or --uglify)'));

    return gulp.src(tmpPath + '/*/index.html')
      .pipe(useref())             // Concatenate with gulp-useref

      .pipe(indexFilter)
      .pipe(replace("dist_js", "../dist_js"))
      .pipe(replace("dist_css", "../dist_css"))
      .pipe(replace("config.js", "../config.js"))
      .pipe(indexFilter.restore)

      .pipe(gulp.dest(tmpPath));
  }
}

function webCleanUnusedFiles(done) {
  log(colors.green('Clean unused files...'));
  const cleanSources = argv.release || argv.uglify || false;

  const wwwPath = './dist/web/www';

  if (cleanSources) {
    return merge(
      // Clean core JS + CSS
      gulp.src(wwwPath + '/js/**/*.js', {read: false})
        .pipe(clean()),
      gulp.src(wwwPath + '/css/**/*.css', {read: false})
        .pipe(clean()),

      // Clean plugins JS + CSS
      gulp.src(wwwPath + '/plugins/**/*.js', {read: false})
        .pipe(clean()),
      gulp.src(wwwPath + '/plugins/**/*.css', {read: false})
        .pipe(clean()),

      // Unused maps/config.js.map
      gulp.src(wwwPath + '/maps/config.js.map', {read: false, allowEmpty: true})
        .pipe(clean())
    )
      .on('end', done);
  }

  if (done) done();
}


function webCleanUnusedDirectories() {
  log(colors.green('Clean unused directories...'));
  const enableUglify = argv.release || argv.uglify || false;

  // Clean dir
  const wwwPath = './dist/web/www';

  let patterns = [
    wwwPath + '/templates',
    wwwPath + '/js',
    wwwPath + '/plugins'
  ];

  if (enableUglify) {
    patterns = patterns.concat([
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
      wwwPath + '/dist_css',
      wwwPath + '/dist_js'
    ]);
  }

  return gulp.src(patterns, {read: false})
    //.pipe(debug({title: 'deleting '}))
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
    './dist/web/ext'
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

function webExtensionZip() {
  const srcPath = './dist/web/ext';
  const distPath = './dist/web/build';
  const version = JSON.parse(fs.readFileSync('./package.json', 'utf8')).version;

  return gulp.src(srcPath + '/**/*.*')
    .pipe(zip('cesium-v'+version+'-extension.zip'))
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

// note : Do not call config, to keep same config between web and webExt artifacts
const webExtBuild = gulp.series(
  webExtCompile,
  webExtensionZip,
  webExtBuildSuccess
);

/* --------------------------------------------------------------------------
   -- Define gulp public tasks
   --------------------------------------------------------------------------*/

exports.help = help;
exports.config = appConfig;
exports.license = appLicense;
exports.sass = appAndPluginSass;
exports.translate = translate;
exports.template = template;
exports.annotate = appNgAnnotate;
exports.watch = appAndPluginWatch;
exports.build = build;

exports.webCompile = webCompile;
exports.webBuild = webBuild;
exports['build:web'] = exports.webBuild; // Alias

exports.webExtClean = webExtClean;
exports.webExtCompile = webExtCompile;
exports.webExtBuild = webExtBuild;
exports.webExtCopyFiles = webExtCopyFiles;
exports['build:webExt'] = exports.webBuild; // Alias

exports.default = gulp.series(appConfig, build);
exports.serveBefore = gulp.series(build, appAndPluginWatch);
exports['ionic:serve:before'] = exports.serveBefore; // Alias need need by @ionic/cli
