#!/usr/bin/env node
"use strict";
var fs = require('fs');

// See: https://stackoverflow.com/questions/49162538/running-cordova-build-android-unable-to-find-attribute-androidfontvariation

var rootdir = process.argv[2];

if (rootdir) {
// go through each of the platform directories that have been prepared
  var platforms = (process.env.CORDOVA_PLATFORMS ? process.env.CORDOVA_PLATFORMS.split(',') : []);

  for (var x = 0; x < platforms.length; x++) {
    try {
      var platform = platforms[x].trim().toLowerCase();

      if (platform == 'android') {
        var android_dir = rootdir + '/platforms/android';
        var gradle_file = rootdir + '/build-extras.gradle';
        var dest_gradle_file = android_dir + '/build-extras.gradle';

        if (fs.existsSync(android_dir) && fs.existsSync(gradle_file)) {
          console.log('-----------------------------------------');
          console.log(' Copy ' + gradle_file + ' to ' + android_dir);
          console.log('-----------------------------------------');
          fs.createReadStream(gradle_file).pipe(fs.createWriteStream(dest_gradle_file));
        } else {
          console.log('-----------------------------------------');
          console.log( ' File ' + gradle_file + ' not found. Skipping copy to /platforms/android');
          console.log('-----------------------------------------');
        }
      }
    } catch (e) {
      process.stdout.write(e);
    }
  }
}

