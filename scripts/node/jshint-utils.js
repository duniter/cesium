'use strict';
const fs = require('fs'),
 path = require('path'),
 jshint = require('jshint').JSHINT,
 log = require('fancy-log'),
 colors = require('ansi-colors'),
 glob = require("glob");

async function lintFolder(dir) {
  log(colors.grey('Processing folder ' + dir + '...'));
  const files = fs.readdirSync(dir);
  return Promise.all(files.map(file => {
    file = dir + '/' + file;
    return new Promise((resolve, reject) => {
      const stat = fs.statSync(file);
      if (stat.isDirectory() || path.extname(file) !== ".js") return resolve(); // Skip
      return lintFile(file).then(resolve).catch(reject);
    })
  }));
}

function lintFile(file) {
  return new Promise((resolve, reject) => {
    log(colors.grey('Processing file ./' + file + '...'));
    fs.readFile(file, (err, data) => {
      if(err) {
        log(colors.red('Error: ' + err));
        reject(err);
        return;
      }
      if(jshint(data.toString())) {
        resolve();
      } else {
        const out = jshint.data(),
          errors = out.errors;
        for(let j = 0; j < errors.length; j++) {
          log(colors.red(`${colors.bold(file + ':' + errors[j].line + ':0' )} -> ${colors.bold(errors[j].evidence.trim())}`));
          log(colors.red(` ${errors[j].reason}`));
        }
        log('-----------------------------------------');
        reject();
      }
    });
  });

}

function getJSFolder(rootDir) {
  // Get folders, from files
  const jsFolders =  glob.sync(rootDir + "/www/**/*.js", {nonull: true})
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


function validate(projectRoot) {

  projectRoot = projectRoot || '.';

  const now = Date.now();
  log(colors.green('Linting JS files... ' + projectRoot));

  const jsFolders = getJSFolder(projectRoot);

  // Process each folder with Js file
  return Promise.all(
    jsFolders.map(folder => lintFolder(folder))
  )
    .catch(err => {
      console.log(err);
      log(colors.red(`Some JS files have errors`));
      process.exit(1);
      throw err;
    })
    .then(() => {
      // Success message
      log(colors.grey('Linting JS files finished in ' + (Date.now() - now) + 'ms'));
    });

}

/* --------------------------------------------------------------------------
   -- Define public function
   --------------------------------------------------------------------------*/

exports.validate = validate;

