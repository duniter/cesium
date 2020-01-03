#!/usr/bin/env node
"use strict";
const gulp = require('gulp');
const path = require("path");
const del = require('del');

const cmd = process.env.CORDOVA_CMDLINE;
const rootdir = process.argv[2];

let skip = true;
if (cmd.indexOf("--release") > -1 || cmd.indexOf("--useref") > -1) {
  skip = false;
}

if (rootdir && !skip) {

  // go through each of the platform directories that have been prepared
  const platforms = (process.env.CORDOVA_PLATFORMS ? process.env.CORDOVA_PLATFORMS.split(',') : []);

  for(let x=0; x<platforms.length; x++) {

    let platform = platforms[x].trim().toLowerCase();

    let wwwPath;
    if(platform === 'android') {
      wwwPath = path.join(rootdir, 'platforms', platform, 'assets', 'www');
    } else {
      wwwPath = path.join(rootdir, 'platforms', platform, 'www');
    }

    // Log
    console.log('['+process.mainModule.filename+'] Cleaning unused directories');

    // Clean unused directories
    del.sync([
      path.join(wwwPath, 'i18n'),
      path.join(wwwPath, 'js'),
      path.join(wwwPath, 'templates'),
      path.join(wwwPath, 'css'),
      path.join(wwwPath, 'dist'),
      path.join(wwwPath, 'cordova-js-src'),
      path.join(wwwPath, 'plugins', 'es'),
      path.join(wwwPath, 'plugins', 'graph'),
      path.join(wwwPath, 'plugins', 'map'),
      path.join(wwwPath, 'plugins', 'rml9'),

      // Clean lib directory...
      path.join(wwwPath, 'lib', '*'),

      // ...but keep Ionic fonts directory
      '!'+path.join(wwwPath, 'lib', 'ionic'),
      path.join(wwwPath, 'lib', 'ionic', '*'),
      '!'+path.join(wwwPath, 'lib', 'ionic', 'fonts'),

      // ...and keep Robotodraft fonts directory
      '!'+path.join(wwwPath, 'lib', 'robotdraft'),
      path.join(wwwPath, 'lib', 'robotdraft', '*'),
      '!'+path.join(wwwPath, 'lib', 'robotdraft', 'fonts')
    ]);
  }
}

