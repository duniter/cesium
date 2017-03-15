#!/usr/bin/env node
"use strict";
var gulp = require('gulp');
var path = require("path");
var replace = require('gulp-replace');

var rootdir = process.argv[2];

if (rootdir) {

  // go through each of the platform directories that have been prepared
  var platforms = (process.env.CORDOVA_PLATFORMS ? process.env.CORDOVA_PLATFORMS.split(',') : []);

  for(var x=0; x<platforms.length; x++) {

    var platform = platforms[x].trim().toLowerCase();

    if(platform == 'ubuntu') {
      var platformPath = path.join(rootdir, 'platforms', platform);
      var ionicConfigFile = path.join(platformPath, 'config.xml');

      // Clean unused directories
      console.log('-----------------------------------------');
      console.log(' Updating file: ' + ionicConfigFile);
      gulp.src(ionicConfigFile)

        // change App ID into 'duniter-cesium'
        .pipe(replace(/id="fr.duniter.cesium"/g, 'id="cesium"'))

        .pipe(gulp.dest(platformPath));

      console.log('-----------------------------------------');
    }


  }
}

