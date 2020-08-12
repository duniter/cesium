#!/usr/bin/env node

const gulp = require('gulp'),
  path = require("path"),
  merge = require('merge2'),
  ngTranslate = require('gulp-angular-translate');

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
        gulp.src(wwwPath + '/i18n/locale-*.json')
          .pipe(ngTranslate({standalone: true, module: 'cesium.translations'}))
          .pipe(gulp.dest(distJsPath)),

        gulp.src(wwwPath + '/plugins/*/i18n/locale-*.json')
          .pipe(ngTranslate({standalone: true, module: 'cesium.plugins.translations'}))
          .pipe(gulp.dest(pluginDistJsPath))
      );
    }
  }

}
