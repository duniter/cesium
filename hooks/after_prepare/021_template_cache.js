#!/usr/bin/env node
"use strict";
var gulp = require('gulp');
var path = require("path");
var templateCache = require('gulp-angular-templatecache');
var es = require('event-stream');
var rootdir = process.argv[2];

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

    var distJsPath = path.join(wwwPath, 'dist', 'dist_js', 'app');
    var pluginDistJsPath = path.join(wwwPath, 'dist', 'dist_js', 'plugins');

    // Concat templates into a JS
    es.concat(
      gulp.src(path.join(wwwPath, 'templates', '**', '*.html'))
        .pipe(templateCache({
          standalone:true,
          module:"cesium.templates",
          root: "templates/"
         }))
        .pipe(gulp.dest(distJsPath)),

       gulp.src(path.join(wwwPath, 'plugins', '*', 'templates', '**', '*.html'))
         .pipe(templateCache({
           standalone:true,
           module:"cesium.plugins.templates",
           root: "plugins/"
          }))
         .pipe(gulp.dest(pluginDistJsPath))
     );
  }
}

