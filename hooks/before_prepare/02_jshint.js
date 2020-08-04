#!/usr/bin/env node

const fs = require('fs'),
 path = require('path'),
 jshint = require('jshint').JSHINT,
 async = require('async'),
 log = require('fancy-log'),
 colors = require('ansi-colors'),
 glob = require("glob");


function processFiles(dir) {
  let errorCount = 0;
  log(colors.grey('Processing folder ' + dir + '...'));
  fs.readdir(dir, function(err, list) {
    if (err) {
      log(colors.red('processFiles err: ' + err));
      return;
    }
    async.eachSeries(list, function(file, innercallback) {
      file = dir + '/' + file;
      log(colors.grey('Processing file ./' + file + '...'));
      fs.stat(file, function(err, stat) {
        if(!stat.isDirectory()) {
          if(path.extname(file) === ".js") {
            lintFile(file, function(hasError) {
              if(hasError) {
                errorCount++;
              }
              innercallback();
            });
          } else {
            innercallback();
          }
        } else {
          innercallback();
        }
      });
    }, function(error) {
      if(errorCount > 0) {
        throw error;
      }
    });
  });
}

function lintFile(file, callback) {
  //log(colors.grey(`Linting ${colors.bold(file)}...`));
  fs.readFile(file, (err, data) => {
    if(err) {
      log(colors.red('Error: ' + err));
      return;
    }
    if(jshint(data.toString())) {
      callback(false);
    } else {
      const out = jshint.data(),
        errors = out.errors;
      for(let j = 0; j < errors.length; j++) {
        log(colors.red(`${colors.bold(file + ':' + errors[j].line + ':0' )} -> ${colors.bold(errors[j].evidence.trim())}`));
        log(colors.red(` ${errors[j].reason}`));
      }
      log('-----------------------------------------');
      callback(true);
    }
  });
}

function getJSFolder() {
  // Get folders, from files
  const jsFolders =  glob.sync("www/**/*.js", {nonull: true})
    // Map to file's folder
    .map(file => file.substring(0, file.lastIndexOf('/')))
    // Reduce to a map of folders
    .reduce((res, folder) => {
      if (folder.indexOf('www/dist/') !== -1 || // Exclude dist js
        folder.indexOf('/plugins/rml') !== -1 || // Exclude plugin tutorial
        folder.indexOf('www/js/vendor') !== -1 || // exclude vendor libs
        folder.indexOf('www/lib') !== -1 // exclude www/lib
      ) {
        return res;
      }
      res[folder] = res[folder] || true;
      return res;
    }, {});
  return Object.keys(jsFolders);
}


// Process each folder with Js file
const errors = [];
getJSFolder().forEach(folder => {
  try {
    processFiles(folder)
  } catch(err) {
    errors.push(err);
  }
});

if (errors.length) {
  log(colors.red(`Some JS files have errors`));
  process.exit(1);
}
