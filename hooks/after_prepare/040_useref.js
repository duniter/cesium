#!/usr/bin/env node
"use strict";
var gulp = require('gulp');
var gutil = require('gulp-util');
var path = require("path");
var es = require('event-stream');
var useref = require('gulp-useref');
var filter = require('gulp-filter');
var uglify = require('gulp-uglify');
var csso = require('gulp-csso');
var rev = require('gulp-rev');
var revReplace = require('gulp-rev-replace');

var cmd = process.env.CORDOVA_CMDLINE;
var rootdir = process.argv[2];
var argv = require('yargs').argv;

var skip = true;
if (cmd.indexOf("--release") > -1 || cmd.indexOf("--useref") > -1) {
    skip = false;
}

if (rootdir && !skip) {

  // go through each of the platform directories that have been prepared
  var platforms = (process.env.CORDOVA_PLATFORMS ? process.env.CORDOVA_PLATFORMS.split(',') : []);

  for(var x=0; x<platforms.length; x++) {

    var platform = platforms[x].trim().toLowerCase();

    var wwwPath;
    if(platform == 'android') {
      wwwPath = path.join(rootdir, 'platforms', platform, 'assets', 'www');
    } else {
      wwwPath = path.join(rootdir, 'platforms', platform, 'www');
    }

    var indexPath = path.join(wwwPath, 'index.html');

    var jsFilter = filter(["**/*.js", "!**/vendor/*", '!**/config.js'], { restore: true });
    var cssFilter = filter("**/*.css", { restore: true });
    var revFilesFilter = filter(['**/*', '!**/index.html', '!**/config.js'], { restore: true });

    // Removing unused code for device...
    es.concat(
      gulp.src(indexPath)
        .pipe(useref())      // Concatenate with gulp-useref
        .pipe(jsFilter)
        .pipe(uglify())             // Minify any javascript sources
        .pipe(jsFilter.restore)
        .pipe(cssFilter)
        .pipe(csso())               // Minify any CSS sources
        .pipe(cssFilter.restore)
        .pipe(revFilesFilter)
        .pipe(rev())                // Rename the concatenated files (but not index.html)
        .pipe(revFilesFilter.restore)
        .pipe(revReplace())         // Substitute in new filenames
        .pipe(gulp.dest(wwwPath))
     );
  }
}

