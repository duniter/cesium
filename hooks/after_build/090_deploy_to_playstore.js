#!/usr/bin/env node
"use strict";
var gulp = require('gulp');
var gutil = require('gulp-util');
var path = require("path");

var cmd = process.env.CORDOVA_CMDLINE;
var rootdir = process.argv[2];
var argv = require('yargs').argv;

var skip = true;
if (/*cmd.indexOf("--release") > -1 || */cmd.indexOf("--playstore") > -1) {
    skip = false;
}

if (rootdir && !skip) {

  // go through each of the platform directories that have been prepared
  var platforms = (process.env.CORDOVA_PLATFORMS ? process.env.CORDOVA_PLATFORMS.split(',') : []);

  for(var x=0; x<platforms.length; x++) {

    var platform = platforms[x].trim().toLowerCase();
    var platformRoot = path.join(rootdir, 'platforms', platform);

    // Deploy for Android
    if(platform == 'android') {

     var apkFileLocation = path.join(platformRoot, 'build/outputs/apk/android-release.apk');

      console.log('Publishing APK file [' + apkFileLocation + '] to playstore...');

      var config = require('../playstore-config.json');

      if(!config) {
        gutil.log(gutil.colors.red("ERROR => Could not load `hooks/playstore-config.json` file!"));
        return;
      }
      if(!config.client_email || !config.private_key) {
        gutil.log(gutil.colors.red("ERROR => Could not found 'client_email' or 'private_key' in 'hooks/playstore-config.json' file."));
        return;
      }

      var publisher = require('playup')(config);

      publisher.upload(apkFileLocation,
      {
        track: 'production',
        recentChanges: {
          'fr-FR': 'New stable release'
        }
      })
      .then(function (data) {
        console.log(' > APK file successfully deployed to Playstore !');
      })
      .catch(function(err) {
        console.log('ERROR while publsihing to playtore: \n' + err);
      })

    }

    else {
      // TODO : deploy other for platforms
    }

  }
}

