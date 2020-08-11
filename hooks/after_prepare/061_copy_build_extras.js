#!/usr/bin/env node
"use strict";
const fs = require('fs'),
 glob = require('glob'),
 path = require('path'),
 log = require('fancy-log'),
 colors = require('ansi-colors');

function mkdirp(dir) {
  const parent = path.dirname(dir);
  if (!fs.existsSync(parent)){
    mkdirp(parent);
  }
  if (!fs.existsSync(dir)){
    fs.mkdirSync(dir);
  }
}

function copyFiles(src_dir, dest_dir) {
  glob(src_dir + '/**/*.*', null, function(er, files) {
    files.forEach(function(file) {
      log(colors.grey(' Copy file ' + file + ' to ' + dest_dir));
      const dest_file = file.replace(src_dir, dest_dir);
      mkdirp(path.dirname(dest_file));
      fs.copyFile(file, dest_file, (err) => {
        if (err) {
          log(colors.red(' ERROR: ' + err));
          throw err;
        }
      });
    });
  });
}

// See: https://stackoverflow.com/questions/49162538/running-cordova-build-android-unable-to-find-attribute-androidfontvariation

const rootdir = process.argv[2];

if (rootdir) {
  // go through each of the platform directories that have been prepared
  const platforms = (process.env.CORDOVA_PLATFORMS ? process.env.CORDOVA_PLATFORMS.split(',') : []);

  for (let x = 0; x < platforms.length; x++) {
    try {
      const platform = platforms[x].trim().toLowerCase();

      if (platform === 'android') {
        const gradle_dir = rootdir + '/gradle';
        const build_dir = rootdir + '/resources/android/build';
        const android_dir = rootdir + '/platforms/android';

        // Copy gradle files
        if (fs.existsSync(gradle_dir)) {
          copyFiles(gradle_dir, android_dir + '/gradle')
        }

        if (fs.existsSync(android_dir) && fs.existsSync(build_dir)) {

          // Copy resources files
          copyFiles(build_dir, android_dir);

          const gradle_file = build_dir + '/build-extras.gradle';
          if (!fs.existsSync(gradle_file)) {
            log(colors.red(' File ' + gradle_file + 'not found. Skipping copy to ' + android_dir));
          }

          const signing_file = build_dir + '/release-signing.properties';
          if (!fs.existsSync(signing_file) && !fs.existsSync(android_dir + '/release-signing.properties')) {
            log(colors.red(' File ' + signing_file + 'not found. Skipping copy to ' + android_dir));
            log(colors.red('   WARNING: Release APK files will not be signed !'));
          }

        } else {
          log(colors.red(' Directory ' + build_dir + 'not found. Skipping copy to ' + android_dir));
        }
      }
    } catch (e) {
      process.stdout.write(e);
    }
  }
}

