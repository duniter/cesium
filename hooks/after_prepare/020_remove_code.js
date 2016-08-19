#!/usr/bin/env node
"use strict";
var gulp = require('gulp');
var gutil = require('gulp-util');
var path = require("path");
var removeCode = require('gulp-remove-code');
var removeHtml = require('gulp-html-remove');
var es = require('event-stream');
var ngAnnotate = require('gulp-ng-annotate');
var htmlmin = require('gulp-htmlmin');

var cmd = process.env.CORDOVA_CMDLINE;
var rootdir = process.argv[2];
var argv = require('yargs').argv;

if (rootdir) {

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

    var pluginPath = path.join(wwwPath, 'plugins') + '/es';

    // Removing unused code for device...
    es.concat(
      // Remove unused HTML tags
      gulp.src([wwwPath + '/templates/**/*.html', pluginPath + '/templates/**/*.html'])
        .pipe(removeCode({device: true}))
        .pipe(removeHtml('.hidden-xs.hidden-sm'))
        .pipe(removeHtml('.hidden-device'))
        .pipe(removeHtml('[remove-if][remove-if="device"]'))
        .pipe(htmlmin())
        .pipe(gulp.dest(".")),

      gulp.src(path.join(wwwPath, 'index.html'))
        .pipe(removeCode({device: true}))
        .pipe(removeHtml('.hidden-xs.hidden-sm'))
        .pipe(removeHtml('.hidden-device'))
        .pipe(removeHtml('[remove-if][remove-if="device"]'))
        .pipe(htmlmin())
        .pipe(gulp.dest(wwwPath)),

      // Remove unused JS code
      gulp.src([wwwPath +  + '/js/**/*.js', pluginPath +  + '/js/**/*.js'])
        .pipe(removeCode({device: true}))
        .pipe(ngAnnotate({single_quotes: true}))
        .pipe(gulp.dest("."))
     );

  }
}

