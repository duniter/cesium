#!/usr/bin/env node
"use strict";
const gulp = require('gulp');
const path = require("path");
const removeCode = require('gulp-remove-code');
const removeHtml = require('gulp-html-remove');
const es = require('event-stream');
const ngAnnotate = require('gulp-ng-annotate');
const htmlmin = require('gulp-htmlmin');
const merge = require('merge2');

const rootdir = process.argv[2];

if (rootdir) {

  // go through each of the platform directories that have been prepared
  const platforms = (process.env.CORDOVA_PLATFORMS ? process.env.CORDOVA_PLATFORMS.split(',') : []);

  for(let x=0; x<platforms.length; x++) {

    let platform = platforms[x].trim().toLowerCase();

    let wwwPath;
    if(platform === 'android') {
      wwwPath = path.join(rootdir, 'platforms', platform, 'assets', 'www');
    } else {
      wwwPath = path.join(rootdir, 'platforms', platform, 'www');
    }

    var pluginPath = path.join(wwwPath, 'plugins') + '/es';

    // Log
    //console.log('['+process.mainModule.filename+'] Removing code for platform '+platform+'\n');

    // Compute options {device-<platform>: true}
    let platformRemoveCodeOptions = {};
    platformRemoveCodeOptions[platform] = true; // = {<platform>: true}

    let htmlminOptions = {removeComments: true, collapseWhitespace: true};

    // Do not remove desktop code for iOS and macOS (support for tablets and desktop macs)
    if (platform !== 'ios' && platform !== 'osx') {
      // Removing unused code for device...
      merge(
        // Remove unused HTML tags
        gulp.src(path.join(wwwPath, 'templates', '**', '*.html'))
          .pipe(removeCode({device: true}))
          .pipe(removeCode(platformRemoveCodeOptions))
          .pipe(removeHtml('.hidden-xs.hidden-sm'))
          .pipe(removeHtml('.hidden-device'))
          .pipe(removeHtml('[remove-if][remove-if="device"]'))
          .pipe(htmlmin(htmlminOptions))
          .pipe(gulp.dest(wwwPath + '/templates')),

        gulp.src(path.join(pluginPath, '**', '*.html'))
          .pipe(removeCode({device: true}))
          .pipe(removeCode(platformRemoveCodeOptions))
          .pipe(removeHtml('.hidden-xs.hidden-sm'))
          .pipe(removeHtml('.hidden-device'))
          .pipe(removeHtml('[remove-if][remove-if="device"]'))
          .pipe(htmlmin(htmlminOptions))
          .pipe(gulp.dest(pluginPath)),

        gulp.src(path.join(wwwPath, 'index.html'))
          .pipe(removeCode({device: true}))
          .pipe(removeCode(platformRemoveCodeOptions))
          .pipe(removeHtml('.hidden-xs.hidden-sm'))
          .pipe(removeHtml('.hidden-device'))
          .pipe(removeHtml('[remove-if][remove-if="device"]'))
          .pipe(htmlmin(/*no options, to build comments*/))
          .pipe(gulp.dest(wwwPath)),

        // Remove unused JS code + add ng annotations
        gulp.src(path.join(wwwPath, 'js', '**', '*.js'))
          .pipe(removeCode({device: true}))
          .pipe(removeCode(platformRemoveCodeOptions))
          .pipe(ngAnnotate({single_quotes: true}))
          .pipe(gulp.dest(wwwPath + '/dist/dist_js/app')),

        gulp.src([pluginPath + '/js/**/*.js'])
          .pipe(removeCode({device: true}))
          .pipe(removeCode(platformRemoveCodeOptions))
          .pipe(ngAnnotate({single_quotes: true}))
          .pipe(gulp.dest(wwwPath + '/dist/dist_js/plugins'))
      );
    } else {
      merge(
        gulp.src(path.join(wwwPath, 'templates', '**', '*.html'))
          .pipe(htmlmin(htmlminOptions))
          .pipe(gulp.dest(wwwPath + '/templates')),

        gulp.src(path.join(pluginPath, '**', '*.html'))
          .pipe(htmlmin(htmlminOptions))
          .pipe(gulp.dest(pluginPath)),

        gulp.src(path.join(wwwPath, 'index.html'))
          .pipe(gulp.dest(wwwPath)),

        gulp.src(path.join(wwwPath, 'js', '**', '*.js'))
          .pipe(ngAnnotate({single_quotes: true}))
          .pipe(gulp.dest(wwwPath + '/dist/dist_js/app')),

        gulp.src([pluginPath + '/js/**/*.js'])
          .pipe(gulp.dest(wwwPath + '/dist/dist_js/plugins'))
      );
    }
  }
}

