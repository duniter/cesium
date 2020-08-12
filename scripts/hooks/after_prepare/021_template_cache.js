#!/usr/bin/env node

const gulp = require('gulp'),
  path = require("path"),
  templateCache = require('gulp-angular-templatecache'),
  merge = require('merge2');

module.exports = function(context) {

  const rootdir = context.opts.projectRoot;
  const platforms = context.opts.platforms;

  if (rootdir && platforms) {

    // go through each of the platform directories that have been prepared
    for (let x = 0; x < platforms.length; x++) {

      let platform = platforms[x].trim().toLowerCase();

      let wwwPath;
      if (platform === 'android') {
        wwwPath = path.join(rootdir, 'platforms', platform, 'app/src/main/assets/www');
      } else {
        wwwPath = path.join(rootdir, 'platforms', platform, 'www');
      }

      let distJsPath = path.join(wwwPath, 'dist', 'dist_js', 'app');
      let pluginDistJsPath = path.join(wwwPath, 'dist', 'dist_js', 'plugins');

      // Concat templates into a JS
      merge(
        gulp.src(path.join(wwwPath, 'templates', '**', '*.html'))
          .pipe(templateCache({
            standalone: true,
            module: "cesium.templates",
            root: "templates/"
          }))
          .pipe(gulp.dest(distJsPath)),

        gulp.src(path.join(wwwPath, 'plugins', '*', 'templates', '**', '*.html'))
          .pipe(templateCache({
            standalone: true,
            module: "cesium.plugins.templates",
            root: "plugins/"
          }))
          .pipe(gulp.dest(pluginDistJsPath))
      );
    }
  }
}
