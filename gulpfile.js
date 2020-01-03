'use strict';

const gulp = require('gulp'),
  sass = require('gulp-sass'),
  cleanCss = require('gulp-clean-css'),
  base64 = require('gulp-base64-v2'),
  rename = require('gulp-rename'),
  ngConstant = require('gulp-ng-constant'),
  fs = require("fs"),
  argv = require('yargs').argv,
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
  csso = require('gulp-csso'),
  replace = require('gulp-replace'),
  rev = require('gulp-rev'),
  revReplace = require('gulp-rev-replace'),
  clean = require('gulp-clean'),
  htmlmin = require('gulp-htmlmin'),
  jshint = require('gulp-jshint'),
  markdown = require('gulp-markdown'),
  sourcemaps = require('gulp-sourcemaps'),
  log = require('fancy-log'),
  colors = require('ansi-colors');

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

  done();
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
    .pipe(sourcemaps.write())
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
    .pipe(templateCache({
      standalone: true,
      module:"cesium.templates",
      root: "templates/"
    }))
    .pipe(gulp.dest('./www/dist/dist_js/app'));
}

function appNgAnnotate(changes) {

  // If watch, apply only on changes files
  if (changes && changes.type === 'changed' && changes.path && changes.path.indexOf('/www/js/') !== -1) {
    let path = changes.path.substring(changes.path.indexOf('/www/js') + 7);
    path = path.substring(0, path.lastIndexOf('/'));
    return gulp.src(changes.path)
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
    .pipe(ngTranslate({standalone:true, module: 'cesium.translations'}))
    .pipe(gulp.dest('www/dist/dist_js/app'));
}

function appLicense() {
  log(colors.green('Building License files...'));

  return es.concat(
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
    .pipe(ngTranslate({standalone:true, module: 'cesium.plugins.translations'}))
    .pipe(gulp.dest('www/dist/dist_js/plugins'));
}

function pluginSass() {
  log(colors.green('Building Plugins Sass...'));

  return es.concat(

    // Copy plugins CSS
    gulp.src(paths.css_plugin)
      .pipe(gulp.dest('www/dist/dist_css/plugins')),

    // Leaflet images
    gulp.src(['scss/leaflet/images/*.*',
      'www/lib/leaflet/dist/images/*.*',
      'www/lib/leaflet-search/images/*.*',
      '!www/lib/leaflet-search/images/back.png',
      '!www/lib/leaflet-search/images/leaflet-search.jpg',
      'www/lib/leaflet.awesome-markers/dist/images/*.*'])
      .pipe(gulp.dest('./www/img/')),

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
        maxImageSize: 14 * 1024
      }))
      .pipe(gulp.dest('./www/css/'))
      .pipe(cleanCss({
        keepSpecialComments: 0
      }))
      .pipe(sourcemaps.write())
      .pipe(rename({ extname: '.min.css' }))
      .pipe(gulp.dest('./www/css/'))
  );
}

/* --------------------------------------------------------------------------
   -- Build the web (ZIP) artifact
   --------------------------------------------------------------------------*/

function webClean() {
  return del([
    './dist/web/www',
    './dist/web/build'
  ]);
}

function webCopyFiles() {
  log(colors.green('Preparing dist/web files...'));

  var tmpPath = './dist/web/www';
  return es.merge(
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
      .pipe(htmlmin())
      .pipe(gulp.dest(tmpPath + '/templates')),

    // Copy index.html (and remove unused code)
    gulp.src('./www/index.html')
      .pipe(removeCode({'no-device': true}))
      .pipe(removeHtml('.hidden-no-device'))
      .pipe(removeHtml('[remove-if][remove-if="no-device"]'))
      .pipe(htmlmin())
      .pipe(gulp.dest(tmpPath)),

    // Copy index.html to debug.html (and remove unused code)
    gulp.src('./www/index.html')
      .pipe(removeCode({'no-device': true}))
      .pipe(removeHtml('.hidden-no-device'))
      .pipe(removeHtml('[remove-if][remove-if="no-device"]'))
      .pipe(rename("debug.html"))
      .pipe(gulp.dest(tmpPath)),

    // Copy API index.html
    gulp.src('./www/api/index.html')
      .pipe(removeCode({'no-device': true}))
      .pipe(removeHtml('.hidden-no-device'))
      .pipe(removeHtml('[remove-if][remove-if="no-device"]'))
      .pipe(htmlmin())
      .pipe(gulp.dest(tmpPath + '/api')),

    // Copy API index.html
    gulp.src('./www/api/index.html')
      .pipe(removeCode({'no-device': true}))
      .pipe(removeHtml('.hidden-no-device'))
      .pipe(removeHtml('[remove-if][remove-if="no-device"]'))
      .pipe(rename("debug.html"))
      .pipe(gulp.dest(tmpPath + '/api')),

    // Copy fonts
    gulp.src('./www/fonts/**/*.*')
      .pipe(gulp.dest(tmpPath + '/fonts')),

    // Copy CSS
    gulp.src('./www/css/**/*.*')
      .pipe(gulp.dest(tmpPath + '/css')),

    // Copy i18n
    gulp.src('./www/i18n/locale-*.json')
      .pipe(ngTranslate({standalone:true, module: 'cesium.translations'}))
      .pipe(gulp.dest(tmpPath + '/js')),

    // Copy img
    gulp.src('./www/img/**/*.*')
      .pipe(gulp.dest(tmpPath + '/img')),

    // Copy manifest
    gulp.src('./www/manifest.json')
      .pipe(gulp.dest(tmpPath)),

    // Copy lib
    gulp.src('./www/lib/**/*.*')
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
    .pipe(templateCache({
      standalone:true,
      module:"cesium.templates",
      root: "templates/"
    }))
    .pipe(gulp.dest(tmpPath + '/dist/dist_js/app'));
}

function webNgAnnotate() {
  var tmpPath = './dist/web/www';
  var jsFilter = filter(["**/*.js", "!**/vendor/*"]);

  return gulp.src(tmpPath + '/js/**/*.js')
    .pipe(jsFilter)
    .pipe(ngAnnotate({single_quotes: true}))
    .pipe(gulp.dest(tmpPath + '/dist/dist_js/app'));
}

function webPluginCopyFiles() {
  var tmpPath = './dist/web/www';
  return es.merge(
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
      .pipe(ngTranslate({standalone:true, module: 'cesium.plugins.translations'}))
      .pipe(gulp.dest(tmpPath + '/dist/dist_js/plugins')),

    // Copy CSS
    gulp.src(paths.css_plugin)
      .pipe(gulp.dest(tmpPath + '/dist/dist_css/plugins'))
  );
}

function webPluginNgTemplate() {
  var tmpPath = './dist/web/www';
  return gulp.src(tmpPath + '/plugins/**/*.html')
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

function webDebugFile() {
  log(colors.green('Building debug.html file...'));
  const tmpPath = './dist/web/www';
  return gulp.src(tmpPath + '/debug.html')
    .pipe(useref())             // Concatenate with gulp-useref
    .pipe(gulp.dest(tmpPath));
}

function webUglify() {
  log(colors.green('Optimizing JS and CSS files...'));

  const wwwPath = './dist/web/www';
  const jsFilter = filter(["**/*.js", '!**/config.js'], { restore: true });
  const cssFilter = filter("**/*.css", { restore: true });
  const revFilesFilter = filter(['**/*', '!**/index.html', '!**/config.js'], { restore: true });
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

  // Process index.html
  return gulp.src(wwwPath + '/index.html')
    .pipe(useref())             // Concatenate with gulp-useref

    // Process JS
    .pipe(jsFilter)
    .pipe(uglify(uglifyOptions)) // Minify javascript files
    .pipe(jsFilter.restore)

    // Process CSS
    .pipe(cssFilter)
    .pipe(csso())               // Minify any CSS sources
    .pipe(cssFilter.restore)

    // Add revision to filename  (but not index.html and config.js)
    .pipe(revFilesFilter)
    .pipe(rev())                // Rename the concatenated files
    .pipe(revFilesFilter.restore)

    .pipe(revReplace())         // Substitute in new filenames
    .pipe(gulp.dest(wwwPath));
}

function webApiDebugFile() {
  log(colors.green('API: Building debug.html...'));

  var tmpPath = './dist/web/www';
  var debugFilter = filter('**/debug.html', { restore: true });

  return gulp.src(tmpPath + '/*/debug.html')
    .pipe(useref())             // Concatenate with gulp-useref

    .pipe(debugFilter)
    .pipe(replace("dist_js", "../dist_js"))
    .pipe(replace("dist_css", "../dist_css"))
    .pipe(replace("config.js", "../config.js"))
    .pipe(debugFilter.restore)

    .pipe(gulp.dest(tmpPath));
}

function webApiUglify() {
  log(colors.green('API: Optimizing JS and CSS files...'));
  const tmpPath = './dist/web/www';
  const jsFilter = filter(["**/*.js", '!**/config.js'], { restore: true });
  const cssFilter = filter("**/*.css", { restore: true });
  const revFilesFilter = filter(['**/*', '!**/index.html', '!**/config.js'], { restore: true });
  const indexFilter = filter('**/index.html', { restore: true });
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
    .pipe(useref())             // Concatenate with gulp-useref

    // Process JS
    .pipe(jsFilter)
    .pipe(uglify(uglifyOptions)) // Minify any javascript sources
    .pipe(jsFilter.restore)

    // Process CSS
    .pipe(cssFilter)
    .pipe(csso())               // Minify any CSS sources
    .pipe(cssFilter.restore)

    // Add revision to filename  (but not index.html and config.js)
    .pipe(revFilesFilter)
    .pipe(rev())                // Rename the concatenated files
    .pipe(revFilesFilter.restore)

    .pipe(revReplace())         // Substitute in new filenames

    .pipe(indexFilter)
    .pipe(replace("dist_js", "../dist_js"))
    .pipe(replace("dist_css", "../dist_css"))
    .pipe(replace("config.js", "../config.js"))
    .pipe(indexFilter.restore)

    .pipe(gulp.dest(tmpPath));
}

function webCleanUnusedFiles() {
  log(colors.green('Clean unused files...'));

  const wwwPath = './dist/web/www';

  return es.concat(
    // Clean core JS + CSS
    gulp.src(wwwPath + '/js/**/*.js', {read: false})
      .pipe(clean()),
    gulp.src(wwwPath + '/css/**/*.css', {read: false})
      .pipe(clean()),

    // Clean plugins JS + CSS
    gulp.src(wwwPath + '/plugins/**/*.js', {read: false})
      .pipe(clean()),
    gulp.src(wwwPath + '/plugins/**/*.css', {read: false})
      .pipe(clean())
  );
}


function webCleanUnusedDirectories() {
  log(colors.green('Clean unused directories...'));

  // Clean dir
  const wwwPath = './dist/web/www';
  return del.sync([
      wwwPath + '/css',
      wwwPath + '/templates',
      wwwPath + '/js',
      wwwPath + '/plugins',
      wwwPath + '/dist',
      wwwPath + '/lib/*',
      '!' + wwwPath + '/lib/ionic',
      '!' + wwwPath + '/lib/robotodraft',
      wwwPath + '/lib/ionic/*',
      '!' + wwwPath + '/lib/ionic/fonts',
      wwwPath + '/lib/robotodraft/*',
      '!' + wwwPath + '/lib/robotodraft/fonts'
    ]);
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

function webBuildSuccess(done) {
  var version = JSON.parse(fs.readFileSync('./package.json', 'utf8')).version;
  log(colors.green("Build for web created at: 'dist/web/build/cesium-v" + version + "-web.zip'"));
  done();
}

/* --------------------------------------------------------------------------
   -- Define gulp public tasks
   --------------------------------------------------------------------------*/

gulp.task('appSass', [], appSass);
gulp.task('appNgTemplate', [], appNgTemplate);
gulp.task('appNgAnnotate', [], appNgAnnotate);
gulp.task('appNgTranslate', [], appNgTranslate);
gulp.task('app', ['appSass', 'appNgTemplate', 'appNgAnnotate', 'appNgTranslate']);

gulp.task('pluginSass', [], pluginSass);
gulp.task('pluginNgTemplate', [], pluginNgTemplate);
gulp.task('pluginNgAnnotate', [], pluginNgAnnotate);
gulp.task('pluginNgTranslate', [], pluginNgTranslate);
gulp.task('plugin', ['pluginSass', 'pluginNgTemplate', 'pluginNgAnnotate', 'pluginNgTranslate']);

gulp.task('config', [], appConfig);
gulp.task('license', [], appLicense);
gulp.task('translate', ['appNgTranslate', 'pluginNgTranslate']);
gulp.task('template', ['appNgTemplate', 'pluginNgTemplate']);
gulp.task('annotate', ['appNgAnnotate', 'pluginNgAnnotate']);
gulp.task('watch', [], appAndPluginWatch);


gulp.task('build', [
  'license',
  'sass',
  'app',
  'plugin'
]);

gulp.task('ionic:serve:before', ['build', 'watch'], done => done());
gulp.task('sass', ['license', 'appSass', 'pluginSass'], done => done());
gulp.task('default', ['config', 'build'], done => done());

gulp.task('webClean', [], webClean);
gulp.task('webCopyFiles', ['config', 'sass', 'webClean'], webCopyFiles);
gulp.task('webNgTemplate', ['webCopyFiles'], webNgTemplate);
gulp.task('webNgAnnotate', ['webNgTemplate'], webNgAnnotate);

gulp.task('webPluginCopyFiles', ['webNgAnnotate'], webPluginCopyFiles);
gulp.task('webPluginNgTemplate', ['webPluginCopyFiles'], webPluginNgTemplate);
gulp.task('webPluginNgAnnotate', ['webPluginNgTemplate'],  webPluginNgAnnotate);

gulp.task('webDebugFile', ['webPluginNgAnnotate'], webDebugFile);
gulp.task('webUglify', ['webDebugFile'], webUglify);
gulp.task('webApiDebugFile', ['webUglify'], webApiDebugFile);
gulp.task('webApiUglify', ['webApiDebugFile'], webApiUglify);

gulp.task('webCleanUnusedFiles', ['webApiUglify'], webCleanUnusedFiles);
gulp.task('webCleanUnusedDirectories', ['webCleanUnusedFiles'], webCleanUnusedDirectories);
gulp.task('webZip', ['webCleanUnusedDirectories'], webZip);

gulp.task('webBuild', ['webZip'], webBuildSuccess);

gulp.task('build:web', ['webZip'], webBuildSuccess); // @deprecated

