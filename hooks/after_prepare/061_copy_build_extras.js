#!/usr/bin/env node
"use strict";
var fs = require('fs');
var glob = require('glob');
var path = require('path')

// See: https://stackoverflow.com/questions/49162538/running-cordova-build-android-unable-to-find-attribute-androidfontvariation

var rootdir = process.argv[2];

if (rootdir) {
// go through each of the platform directories that have been prepared
  var platforms = (process.env.CORDOVA_PLATFORMS ? process.env.CORDOVA_PLATFORMS.split(',') : []);

  for (var x = 0; x < platforms.length; x++) {
    try {
      var platform = platforms[x].trim().toLowerCase();

      if (platform == 'android') {
        var build_dir = rootdir + '/resources/android/build';
        var android_dir = rootdir + '/platforms/android';
        var build_files = build_dir + '/**/*.*';

        console.log('-----------------------------------------');
        if (fs.existsSync(android_dir) && fs.existsSync(build_dir)) {
          glob(build_files, null, function(er, files) {
            files.forEach(function(file) {
              console.log(' Copy ' + file + ' to ' + android_dir);
              var dest_file = file.replace(build_dir, android_dir);
              fs.createReadStream(file).pipe(fs.createWriteStream(dest_file));
            });
          });

          var gradle_file = build_dir + '/build-extras.gradle';
          if (!fs.existsSync(gradle_file)) {
            console.log( ' File ' + gradle_file + ' not found. Skipping copy to /platforms/android');
          }

          var signing_file = build_dir + '/release-signing.properties';
          if (!fs.existsSync(signing_file)) {
            console.log( ' File ' + signing_file + ' not found. Skipping copy to /platforms/android');
            console.log( '   WARNING: Release APK files will not be signed !');
          }

        } else {
            console.log( ' Directory ' + build_dir + ' not found. Skipping copy to /platforms/android');
        }
        console.log('-----------------------------------------');
      }
    } catch (e) {
      process.stdout.write(e);
    }
  }
}

