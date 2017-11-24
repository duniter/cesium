'use strict';

var gulp = require('gulp');
var gutil = require('gulp-util');
var bower = require('bower');
var concat = require('gulp-concat');
var path = require("path");
var sass = require('gulp-sass');
var cleanCss = require('gulp-clean-css');
var base64 = require('gulp-base64');
var rename = require('gulp-rename');
var sh = require('shelljs');
var ngConstant = require('gulp-ng-constant');
var fs = require("fs");
var argv = require('yargs').argv;
var header = require('gulp-header');
var footer = require('gulp-footer');
var removeCode = require('gulp-remove-code');
var removeHtml = require('gulp-html-remove');
var templateCache = require('gulp-angular-templatecache');
var ngTranslate = require('gulp-angular-translate');
var ngAnnotate = require('gulp-ng-annotate');
var es = require('event-stream');
var zip = require('gulp-zip');
var del = require('del');
var useref = require('gulp-useref');
var filter = require('gulp-filter');
var uglify = require('gulp-uglify');
var csso = require('gulp-csso');
var replace = require('gulp-replace');
var rev = require('gulp-rev');
var revReplace = require('gulp-rev-replace');
var clean = require('gulp-clean');
var htmlmin = require('gulp-htmlmin');
var jshint = require('gulp-jshint');
var sourcemaps = require('gulp-sourcemaps');
var concatCss = require('gulp-concat-css');
var markdown = require('gulp-markdown');

var paths = {
  sass: ['./scss/**/*.scss'],
  config: ['./app/config.json'],
  templatecache: ['./www/templates/**/*.html'],
  ng_translate: ['./www/i18n/locale-*.json'],
  ng_annotate: ['./www/js/**/*.js', '!./www/js/vendor/*.js'],
  // plugins:
  templatecache_plugin: ['./www/plugins/*/templates/**/*.html'],
  ng_translate_plugin: ['./www/plugins/*/i18n/locale-*.json'],
  ng_annotate_plugin: ['./www/plugins/*/**/*.js', '!./www/plugins/*/js/vendor/*.js'],
  css_plugin: ['./www/plugins/*/css/**/*.css'],
  license_md: ['./www/license/*.md']
};

gulp.task('serve:before', ["sass",
  "templatecache",
  "ng_annotate",
  "ng_translate",
  "templatecache_plugin",
  "ng_annotate_plugin",
  "ng_translate_plugin",
  "css_plugin",
  "license_md"]);

gulp.task('default', ['config', 'serve:before']);

gulp.task('sass-images', function (done) {
  gulp.src('./scss/leaflet/images/**/*.*')
    .pipe(gulp.dest('./www/img/'))
    .on('end', done);
});

gulp.task('sass', ['sass-images'], function(done) {

  es.concat(
    // Default App style
    gulp.src('./scss/ionic.app.scss')
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
      .pipe(gulp.dest('./www/css/')),

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
        deleteAfterEncoding: true
      }))
      .pipe(gulp.dest('./www/css/'))
      .pipe(cleanCss({
        keepSpecialComments: 0
      }))
      .pipe(sourcemaps.write())
      .pipe(rename({ extname: '.min.css' }))
      .pipe(gulp.dest('./www/css/'))
  )
  .on('end', done);
});

gulp.task('watch', function() {
  gulp.watch(paths.sass, ['sass']);
  gulp.watch(paths.templatecache, ['templatecache']);
  gulp.watch(paths.ng_annotate, ['ng_annotate']);
  gulp.watch(paths.ng_translate, ['ng_translate']);
  // plugins:
  gulp.watch(paths.templatecache_plugin, ['templatecache_plugin']);
  gulp.watch(paths.ng_annotate_plugin, ['ng_annotate_plugin']);
  gulp.watch(paths.ng_translate_plugin, ['ng_translate_plugin']);
  gulp.watch(paths.css_plugin, ['css_plugin']);
  gulp.watch(paths.license_md, ['license_md']);
});

gulp.task('install', ['git-check'], function() {
  return bower.commands.install()
    .on('log', function(data) {
      gutil.log('bower', gutil.colors.cyan(data.id), data.message);
    });
});

gulp.task('git-check', function(done) {
  if (!sh.which('git')) {
    console.log(
      '  ' + gutil.colors.red('Git is not installed.'),
      '\n  Git, the version control system, is required to download Ionic.',
      '\n  Download git here:', gutil.colors.cyan('http://git-scm.com/downloads') + '.',
      '\n  Once git is installed, run \'' + gutil.colors.cyan('gulp install') + '\' again.'
    );
    process.exit(1);
  }
  done();
});

gulp.task('config', function (done) {
  var allConfig = JSON.parse(fs.readFileSync('./app/config.json', 'utf8'));

  // Determine which environment to use when building config.
  var env = argv.env || 'default';
  var config = allConfig[env];

  if(!config) {
    gutil.log(gutil.colors.red("=> Could not load `" + env + "` environment!"));
    process.exit(1);
  }

  gutil.log(gutil.colors.green("Building `www/js/config.js` for `" + env + "` environment..."));

  var project = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
  config['version'] = project.version;
  config['build'] = (new Date()).toJSON();
  config['newIssueUrl'] = project.bugs.new;

  ngConstant({
      name: 'cesium.config',
      constants: {"csConfig": config},
      stream: true,
      dest: 'config.js'
    })
    // Add a warning header
    .pipe(header("/******\n* !! WARNING: This is a generated file !!\n*\n* PLEASE DO NOT MODIFY DIRECTLY\n*\n* => Changes should be done on file 'app/config.json'.\n******/\n\n"))
    // Writes into file www/js/config.js
    .pipe(rename('config.js'))
    .pipe(gulp.dest('www/js'))
    .on('end', done);
});

gulp.task('templatecache', function (done) {
  gulp.src(paths.templatecache)
    .pipe(templateCache({
      standalone:true,
      module:"cesium.templates",
      root: "templates/"
     }))
    //.pipe(gulp.dest('www/js'))
    .pipe(gulp.dest('./www/dist/dist_js/app'))
    .on('end', done);
});

gulp.task('ng_annotate', function (done) {
  gulp.src(paths.ng_annotate)
    .pipe(ngAnnotate({single_quotes: true}))
    .pipe(gulp.dest('./www/dist/dist_js/app'))
    .on('end', done);
});

gulp.task('ng_translate', function(done) {
  gulp.src('www/i18n/locale-*.json')
    .pipe(ngTranslate({standalone:true, module: 'cesium.translations'}))
    .pipe(gulp.dest('www/dist/dist_js/app'))
    .on('end', done);
});


gulp.task('license_md', function (done) {
  es.concat(
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
  )
    .on('end', done);
});


gulp.task('debug_file', function(done) {
  gutil.log(gutil.colors.green("Building `www/debug.html`..."));

  return gulp.src(['www/index.html'])
    .pipe(replace('dist/dist_js/app/', 'js/'))
    .pipe(replace('dist/dist_js/plugins/', 'plugins/'))
    // Restore some generate files
    .pipe(replace('js/templates.js', 'dist/dist_js/app/templates.js'))
    .pipe(replace('js/translations.js', 'dist/dist_js/app/translations.js'))
    .pipe(replace('plugins/templates.js', 'dist/dist_js/plugins/templates.js'))
    .pipe(replace('plugins/translations.js', 'dist/dist_js/plugins/translations.js'))
    .pipe(replace('ng-strict-di', ''))
    .pipe(rename('debug.html'))
    .pipe(gulp.dest('www'))
    .on('end', done);
});

/* -- Plugins -- */

gulp.task('templatecache_plugin', function (done) {
  gulp.src(paths.templatecache_plugin)
    .pipe(templateCache({
      standalone:true,
      module:"cesium.plugins.templates",
      root: "plugins/"
     }))
    .pipe(gulp.dest('./www/dist/dist_js/plugins'))
    .on('end', done);
});

gulp.task('ng_annotate_plugin', function (done) {
  gulp.src(paths.ng_annotate_plugin)
    .pipe(ngAnnotate({single_quotes: true}))
    .pipe(gulp.dest('./www/dist/dist_js/plugins'))
    .on('end', done);
});

gulp.task('ng_translate_plugin', function(done) {
  gulp.src(paths.ng_translate_plugin)
    .pipe(ngTranslate({standalone:true, module: 'cesium.plugins.translations'}))
    .pipe(gulp.dest('www/dist/dist_js/plugins'))
    .on('end', done);
});

gulp.task('css_plugin', function (done) {
  gulp.src(paths.css_plugin)
    .pipe(gulp.dest('./www/dist/dist_css/plugins'))
    .on('end', done);
});

/* -- Web dist build -- */
gulp.task('clean:tmp', function(done) {
  del(['tmp'], done);
});

gulp.task('clean:web', function(done) {
  del([
      './platforms/web/www',
      './platforms/web/build'
    ], done);
});

gulp.task('copy-files:web', ['clean:tmp', 'clean:web', 'sass', 'config'], function(done) {
  var tmpPath = './platforms/web/www';
  es.concat(
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

    // Copy lib/ionic
    gulp.src('./www/lib/ionic/**/*.*')
      .pipe(gulp.dest(tmpPath + '/lib/ionic')),

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

  )
  .on('end', done);
});

gulp.task('templatecache:web', ['copy-files:web'], function (done) {
  var tmpPath = './platforms/web/www';
  gulp.src(tmpPath + '/templates/**/*.html')
    .pipe(templateCache({
      standalone:true,
      module:"cesium.templates",
      root: "templates/"
     }))
    .pipe(gulp.dest(tmpPath + '/js'))
    .on('end', done);
});

gulp.task('ng_annotate:web', ['templatecache:web'], function (done) {
  var tmpPath = './platforms/web/www';
  var jsFilter = filter(["**/*.js", "!**/vendor/*"]);

  gulp.src(tmpPath + '/js/**/*.js')
    .pipe(jsFilter)
    .pipe(ngAnnotate({single_quotes: true}))
    .pipe(gulp.dest(tmpPath + '/dist/dist_js/app'))
    .on('end', done);
});

gulp.task('copy-plugin-files:web', ['clean:tmp', 'clean:web', 'sass', 'config'], function(done) {
  var tmpPath = './platforms/web/www';
  es.concat(
    // Transform i18n into JS
    gulp.src(paths.ng_translate_plugin)
        .pipe(ngTranslate({standalone:true, module: 'cesium.plugins.translations'}))
        .pipe(gulp.dest(tmpPath + '/dist/dist_js/plugins')),

    // Copy CSS
    gulp.src(paths.css_plugin)
        .pipe(gulp.dest(tmpPath + '/dist/dist_css/plugins'))
  )
  .on('end', done);
});

gulp.task('templatecache-plugin:web', ['copy-plugin-files:web'], function (done) {
  var tmpPath = './platforms/web/www';
  gulp.src(paths.templatecache_plugin)
    .pipe(templateCache({
      standalone:true,
      module:"cesium.plugins.templates",
      root: "plugins/"
     }))
    .pipe(gulp.dest(tmpPath + '/dist/dist_js/plugins'))
    .on('end', done);
});

gulp.task('ng_annotate-plugin:web', ['templatecache-plugin:web'], function (done) {
  var tmpPath = './platforms/web/www';
  gulp.src(paths.ng_annotate_plugin)
    .pipe(ngAnnotate({single_quotes: true}))
    .pipe(gulp.dest(tmpPath + '/dist/dist_js/plugins'))
    .on('end', done);
});

gulp.task('debug-api-files:web', ['ng_annotate:web', 'ng_annotate-plugin:web'], function(done) {
  var tmpPath = './platforms/web/www';
  var debugFilter = filter('**/debug.html', { restore: true });

  gulp.src(tmpPath + '/*/debug.html')
    .pipe(useref())             // Concatenate with gulp-useref

    .pipe(debugFilter)
    .pipe(replace("dist_js", "../dist_js"))
    .pipe(replace("dist_css", "../dist_css"))
    .pipe(replace("config.js", "../config.js"))
    .pipe(debugFilter.restore)

    .pipe(gulp.dest(tmpPath))
    .on('end', done);
});

gulp.task('optimize-api-files:web', ['debug-api-files:web'], function(done) {
  var tmpPath = './platforms/web/www';
  var jsFilter = filter(["**/*.js", '!**/config.js'], { restore: true });
  var cssFilter = filter("**/*.css", { restore: true });
  var revFilesFilter = filter(['**/*', '!**/index.html', '!**/config.js'], { restore: true });
  var indexFilter = filter('**/index.html', { restore: true });

  // Process index.html
  gulp.src(tmpPath + '/*/index.html')
    .pipe(useref())             // Concatenate with gulp-useref

    // Process JS
    .pipe(jsFilter)
    .pipe(uglify())             // Minify any javascript sources
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

    .pipe(gulp.dest(tmpPath))
    .on('end', done);

});

gulp.task('debug-files:web', ['optimize-api-files:web'], function(done) {
  var tmpPath = './platforms/web/www';
  gulp.src(tmpPath + '/debug.html')
    .pipe(useref())             // Concatenate with gulp-useref
    .pipe(gulp.dest(tmpPath))
    .on('end', done);
});

gulp.task('optimize-files:web', ['debug-files:web'], function(done) {
  var tmpPath = './platforms/web/www';
  var jsFilter = filter(["**/*.js", '!**/config.js'], { restore: true });
  var cssFilter = filter("**/*.css", { restore: true });
  var revFilesFilter = filter(['**/*', '!**/index.html', '!**/config.js'], { restore: true });

  // Process index.html
  gulp.src(tmpPath + '/index.html')
    .pipe(useref())             // Concatenate with gulp-useref

    // Process JS
    .pipe(jsFilter)
    .pipe(uglify())             // Minify any javascript sources
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
    .pipe(gulp.dest(tmpPath))
    .on('end', done);

});

gulp.task('clean-unused-files:web', ['optimize-files:web'], function(done) {
  var tmpPath = './platforms/web/www';

  es.concat(
    gulp.src(tmpPath + '/js/**/*.js', {read: false})
      .pipe(clean()),

    gulp.src(tmpPath + '/css/**/*.css', {read: false})
      .pipe(clean())
  )
  .on ('end', done);
});

gulp.task('clean-unused-directories:web', ['clean-unused-files:web'], function(done) {
  var tmpPath = './platforms/web/www';
  del([
    tmpPath + '/css',
    tmpPath + '/templates',
    tmpPath + '/js',
    tmpPath + '/dist',
    tmpPath + '/lib/ionic/scss',
    tmpPath + '/lib/ionic/css',
    tmpPath + '/lib/ionic/js',
    tmpPath + '/lib/ionic/version.json'
  ], done);
});

gulp.task('zip:web', ['clean-unused-directories:web'], function(done) {
  var tmpPath = './platforms/web/www';
  var version = JSON.parse(fs.readFileSync('./package.json', 'utf8')).version;
  var txtFilter = filter(["**/*.txt"], { restore: true });

  gulp.src(tmpPath + '/**/*.*')

    // Process TXT files: Add the UTF-8 BOM character
    .pipe(txtFilter)
    .pipe(header('\ufeff'))
    .pipe(txtFilter.restore)

    .pipe(zip('cesium-web-'+version+'.zip'))

    .pipe(gulp.dest('./platforms/web/build'))
    .on('end', done);
});

gulp.task('build:web', ['git-check', 'zip:web'], function(done) {
  var version = JSON.parse(fs.readFileSync('./package.json', 'utf8')).version;
  gutil.log(gutil.colors.green("Build for web created at: 'plateforms/web/build/cesium-web-" + version + ".zip'"));
  del(['tmp'], done);
});

gulp.task('deploy:android', function (done) {
  var config = require('./hooks/playstore-config.json');

  if(!config) {
    gutil.log(gutil.colors.red("ERROR => Could not load `./hooks/playstore-config.json` file!"));
    return done();
  }
  if(!config.client_email || !config.private_key) {
    gutil.log(gutil.colors.red("ERROR => Could not found 'client_email' or 'private_key' in 'hooks/playstore-config.json' file."));
    return done();
  }

  var publisher = require('playup')(config);

  var apkFileLocation = path.join('.', 'platforms', 'android', 'build', 'outputs', 'apk', 'android-release.apk');
  console.log('Publishing APK file [' + apkFileLocation + '] to playstore...');

  publisher.upload(apkFileLocation, {
    track: 'production',
    recentChanges: {
      'fr-FR': 'New stable release'
    }
  })
  .then(function (data) {
    console.log(' > APK has been deployed to playstore !');
    done();
  })
  .catch(function(err){
    console.log(err);
    done();
  });
});
