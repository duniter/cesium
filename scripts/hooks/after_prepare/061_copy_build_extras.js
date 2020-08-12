#!/usr/bin/env node

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
module.exports = function(context) {

  const rootdir = context.opts.projectRoot;
  const platforms = context.opts.platforms;

  if (rootdir && platforms) {
    // go through each of the platform directories that have been prepared
    for (let x = 0; x < platforms.length; x++) {
      try {
        const platform = platforms[x].trim().toLowerCase();

        if (platform === 'android') {
          const gradle_dir = path.join(rootdir, 'gradle');
          const buildRelativePath =  path.join('resources', 'android', 'build');
          const build_dir = path.join(rootdir, buildRelativePath);
          const android_dir = path.join(rootdir, 'platforms', 'android');

          // Copy gradle files
          if (fs.existsSync(gradle_dir)) {
            copyFiles(gradle_dir, android_dir + '/gradle')
          }

          if (fs.existsSync(android_dir) && fs.existsSync(build_dir)) {

            // Copy resources files
            copyFiles(build_dir, android_dir);

            // Copy signing stuff
            const signing_file = build_dir + '/release-signing.properties';
            if (!fs.existsSync(signing_file) && !fs.existsSync(android_dir + '/release-signing.properties')) {
              log(colors.blue('WARNING: Missing file ' + buildRelativePath + '/release-signing.properties. Cannot copy it into ' + android_dir));
              log(colors.blue('  Please create it manually at ' + android_dir + '/release-signing.properties'));
              log(colors.blue('  otherwise release APK files will NOT be signed! '));
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

}
