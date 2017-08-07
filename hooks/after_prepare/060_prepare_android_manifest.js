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

    if(platform == 'android') {
      var platformPath = path.join(rootdir, 'platforms', platform);
      var androidManifestFile = path.join(platformPath, 'AndroidManifest.xml');

      // Clean unused directories
      console.log('-----------------------------------------');
      console.log(' Updating file: ' + androidManifestFile);
      gulp.src(androidManifestFile)

        // Add 'tools' namespace to root tag
        .pipe(replace(/(xmlns:android="http:\/\/schemas.android.com\/apk\/res\/android")\s*>/g, '$1 xmlns:tools="http://schemas.android.com/tools">'))

        // <uses-sdk> : if many, keep only one
        .pipe(replace(/(<uses-sdk [^>]+>)(:?[\n\r\s\t ]*<uses-sdk [^>]+>)+/mg, '$1'))

        // <uses-sdk> : Replace 'targetSdkversion' and add tools:overrideLibrary
        .pipe(replace(/android:targetSdkVersion="[0-9]+"( tools:overrideLibrary="org.kaliumjni.lib")?\s*\/>/g, 'android:targetSdkVersion="25" tools:overrideLibrary="org.kaliumjni.lib" />'))

        .pipe(gulp.dest(platformPath));

      console.log('-----------------------------------------');
    }


  }
}

