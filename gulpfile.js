'use strict';

var gulp = require('gulp');
var gutil = require('gulp-util');
var bower = require('bower');
var concat = require('gulp-concat');
var sass = require('gulp-sass');
var minifyCss = require('gulp-minify-css');
var rename = require('gulp-rename');
var sh = require('shelljs');
var ngConstant = require('gulp-ng-constant');
var fs = require("fs");
var argv = require('yargs').argv;
var header = require('gulp-header');
var removeCode = require('gulp-remove-code');

var paths = {
  sass: ['./scss/**/*.scss'],
  config: ['./app/config.json'],
  templates: ['./www/templates/**/*.html']
};

gulp.task('default', ['sass', 'config']);

gulp.task('sass', function(done) {
  gulp.src('./scss/ionic.app.scss')
    .pipe(sass()).on('error', sass.logError)
    .pipe(gulp.dest('./www/css/'))
    .pipe(minifyCss({
      keepSpecialComments: 0
    }))
    .pipe(rename({ extname: '.min.css' }))
    .pipe(gulp.dest('./www/css/'))
    .on('end', done);
});

// TODO : enable to have a special buidl for phone
//gulp.task('removeCode', function(done) {
//  gulp.src('./www/templates/**/*.html')
//    .pipe(removeCode({ production: true }))
//    .pipe(gulp.dest('./dist/templates'))
//    .on('end', done);
//});

gulp.task('watch', function() {
  gulp.watch(paths.sass, ['sass']);
  //gulp.watch(paths.config, ['config']);
  //gulp.watch(paths.templates, ['removeCode']);
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
    return done();
  }

  gutil.log(gutil.colors.green("Building `www/js/config.js` for `" + env + "` environment..."));

  config['APP_CONFIG']['VERSION'] = JSON.parse(fs.readFileSync('./package.json', 'utf8')).version;
  config['APP_CONFIG']['BUILD_DATE'] = (new Date()).toJSON();

  return ngConstant({
      name: 'cesium.config',
      constants: config,
      stream: true,
      dest: 'config.js'
    })
    // Add a warning header
    .pipe(header("/******\n* !! WARNING: This is a generated file !!\n*\n* PLEASE DO NOT MODIFY DIRECTLY\n*\n* => Changes should be done on file 'app/config.json'.\n******/\n\n"))
    // Writes into file www/js/config.js
    .pipe(rename('config.js'))
    .pipe(gulp.dest('www/js'))
    ;
});
