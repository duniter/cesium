#!/usr/bin/env node
"use strict";
const gulp = require('gulp'),
  path = require("path"),
  es = require('event-stream'),
  useref = require('gulp-useref'),
  filter = require('gulp-filter'),
  uglify = require('gulp-uglify-es').default,
  csso = require('gulp-csso'),
  rev = require('gulp-rev'),
  revReplace = require('gulp-rev-replace'),
  log = require('fancy-log'),
  colors = require('ansi-colors');


const cmd = process.env.CORDOVA_CMDLINE;
const rootdir = process.argv[2];

let skip = true;
if (cmd.indexOf("--release") > -1 || cmd.indexOf("--useref") > -1) {
    skip = false;
}
else {
  log(colors.grey('Skipping useref'));
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

    let indexPath = path.join(wwwPath, 'index.html');

    const jsFilter = filter(['**/*.js', '!**/vendor/*', '!**/config.js'], { restore: true });
    const cssFilter = filter('**/*.css', { restore: true });
    const revFilesFilter = filter(['**/*', '!**/index.html', '!**/config.js'], { restore: true });
    const uglifyOptions = {
      toplevel: true,
      warnings: true,
      ecma: '5',
      mangle: {
        reserved: ['qrcode', 'Base58']
      },
      compress: {
        global_defs: {
          "@console.log": "alert"
        },
        passes: 2
      },
      output: {
        beautify: false,
        preamble: "/* minified */",
        max_line_len: 120000
      }
    };

    // Removing unused code for device...
    es.concat(
      gulp.src(indexPath)
        .pipe(useref())      // Concatenate with gulp-useref
        .pipe(jsFilter)
        .pipe(uglify(uglifyOptions)) // Minify any javascript sources
        .pipe(jsFilter.restore)
        .pipe(cssFilter)
        .pipe(csso())               // Minify any CSS sources
        .pipe(cssFilter.restore)
        .pipe(revFilesFilter)
        .pipe(rev())                // Rename the concatenated files (but not index.html)
        .pipe(revFilesFilter.restore)
        .pipe(revReplace())         // Substitute in new filenames
        .pipe(gulp.dest(wwwPath))
     );
  }
}

