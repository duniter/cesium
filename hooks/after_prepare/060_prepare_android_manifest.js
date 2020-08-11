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

    if (platform === 'android') {
      //let srcMainPath = path.join(rootdir, 'platforms', platform, 'app', 'src', 'main');
      let srcMainPath = path.join(rootdir, 'platforms', platform);
      let androidManifestFile = path.join(srcMainPath, 'AndroidManifest.xml');

      // Clean unused directories
      console.log('-----------------------------------------');
      console.log(' Updating file: ' + androidManifestFile);
      gulp.src(androidManifestFile)

        // Add 'tools' namespace to root tag
        .pipe(replace(/(xmlns:android="http:\/\/schemas.android.com\/apk\/res\/android")\s*>/g, '$1 xmlns:tools="http://schemas.android.com/tools">'))

        // Add <application> (replace 'targetSdkversion' and add tools:overrideLibrary)
        .pipe(replace(/\s+tools:replace="android:appComponentFactory"/, ''))
        .pipe(replace(/\s+android:appComponentFactory="[^"]+"/, ''))
        .pipe(replace(/(\s*<application)\s*/, '$1 tools:replace="android:appComponentFactory" android:appComponentFactory="androidx.core.app.CoreComponentFactory" '))

        // remove all <uses-sdk>
        .pipe(replace(/<uses-sdk [^>]+\/>/g, ''))

        // add <uses-sdk> (replace 'targetSdkversion' and add tools:overrideLibrary)
        .pipe(replace(/(<\/manifest>)/, '    <uses-sdk android:minSdkVersion="16" android:targetSdkVersion="29" tools:overrideLibrary="org.kaliumjni.lib" />\n$1'))

        .pipe(gulp.dest(srcMainPath));

      console.log('-----------------------------------------');

    }


  }
}

