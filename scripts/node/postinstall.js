#!/usr/bin/env node

const fs = require('fs'),
path = require('path');

// Remove not used file (from old cordova-uglify plugin)
try {
  fs.unlinkSync('hooks/uglify-config.json');
} catch (e) {
  // Silent
}


// Replace /www/lib with a symbolic link to bower component libs
try {
  fs.unlinkSync('www/lib');
}
catch(e ) {
  // Silent
}
try {
  fs.symlinkSync(path.resolve('node_modules/@bower_components'), 'www/lib', 'junction');
} catch (e) {
  throw new Error(e);
}

// Remove some symbolic links, from the www/lib.
// This is a workaround, because Cordova copy failed on this file
try {
  fs.unlinkSync('www/lib/ionic-material/node_modules/.bin/gulp');
}
catch(e) {
  // Silent
}
try {
  fs.unlinkSync('www/lib/moment/meteor/moment.js');
} catch (e) {
  // Silent
}

try {
  if (!fs.existsSync('plugins')) {
    fs.mkdirSync('plugins');
  }
  fs.symlinkSync(path.resolve('node_modules/cordova-plugin-minisodium'), 'plugins/cordova-plugin-minisodium', 'junction');
} catch (e) {
  throw new Error(e);
}
