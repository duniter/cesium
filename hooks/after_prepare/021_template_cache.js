#!/usr/bin/env node
"use strict";
const gulp = require('gulp');
const path = require("path");
const templateCache = require('gulp-angular-templatecache');
const merge = require('merge2');
const rootdir = process.argv[2];

if (rootdir) {

  // go through each of the platform directories that have been prepared
  const platforms = (process.env.CORDOVA_PLATFORMS ? process.env.CORDOVA_PLATFORMS.split(',') : []);

  for(let x=0; x<platforms.length; x++) {

    let platform = platforms[x].trim().toLowerCase();

    let wwwPath;
    if(platform == 'android') {
      wwwPath = path.join(rootdir, 'platforms', platform, 'assets', 'www');
    } else {
      wwwPath = path.join(rootdir, 'platforms', platform, 'www');
    }

    let distJsPath = path.join(wwwPath, 'dist', 'dist_js', 'app');
    let pluginDistJsPath = path.join(wwwPath, 'dist', 'dist_js', 'plugins');

    // Concat templates into a JS
    merge(
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

