#!/usr/bin/env node
"use strict";
var gulp = require('gulp');
var gutil = require('gulp-util');
var allConfig = require('../../app/config.json');
var path = require("path");
var del = require('del');

var cmd = process.env.CORDOVA_CMDLINE;
var rootdir = process.argv[2];
var argv = require('yargs').argv;

var skip = true;
if (cmd.indexOf("--release") > -1 || cmd.indexOf("--useref") > -1) {
    skip = false;
}

if (rootdir && !skip) {

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

    // Clean unused directories
    console.log('Cleaning dir ' + path.join(wwwPath, 'lib', '**'));
    del([
      path.join(wwwPath, 'i18n'),
      path.join(wwwPath, 'js'),
      path.join(wwwPath, 'templates'),
      path.join(wwwPath, 'css'),
      path.join(wwwPath, 'dist'),
      path.join(wwwPath, 'js'),
      path.join(wwwPath, 'cordova-js-src'),
      path.join(wwwPath, 'plugins', 'es'),
      path.join(wwwPath, 'lib', '**'),
      // Keep Ionic lib/ionic/fonts directory
      '!'+path.join(wwwPath, 'lib'),
      '!'+path.join(wwwPath, 'lib', 'ionic'),
      '!'+path.join(wwwPath, 'lib', 'ionic', 'fonts'),
      '!'+path.join(wwwPath, 'lib', 'ionic', 'fonts', '*.*')
    ]);
  }
}

