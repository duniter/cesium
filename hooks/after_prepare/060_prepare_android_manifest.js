#!/usr/bin/env node
"use strict";
const gulp = require('gulp');
const path = require("path");
const replace = require('gulp-replace');

const rootdir = process.argv[2];

if (rootdir) {

  // go through each of the platform directories that have been prepared
  const platforms = (process.env.CORDOVA_PLATFORMS ? process.env.CORDOVA_PLATFORMS.split(',') : []);

  for(let x=0; x<platforms.length; x++) {

    let platform = platforms[x].trim().toLowerCase();

    if(platform == 'android') {
      let platformPath = path.join(rootdir, 'platforms', platform);
      let androidManifestFile = path.join(platformPath, 'AndroidManifest.xml');

      // Clean unused directories
      console.log('-----------------------------------------');
      console.log(' Updating file: ' + androidManifestFile);
      gulp.src(androidManifestFile)

        // Add 'tools' namespace to root tag
        .pipe(replace(/(xmlns:android="http:\/\/schemas.android.com\/apk\/res\/android")\s*>/g, '$1 xmlns:tools="http://schemas.android.com/tools">'))

        // remove all <uses-sdk>
        .pipe(replace(/<uses-sdk [^>]+\/>/g, ''))

        // add <uses-sdk> (replace 'targetSdkversion' and add tools:overrideLibrary)
        .pipe(replace(/(<\/manifest>)/, '    <uses-sdk android:minSdkVersion="19" android:targetSdkVersion="28" tools:overrideLibrary="org.kaliumjni.lib" />\n$1'))

        .pipe(gulp.dest(platformPath));

      console.log('-----------------------------------------');

    }


  }
}

