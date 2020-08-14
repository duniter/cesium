#!/usr/bin/env node

const gulp = require('gulp'),
  path = require("path"),
  colors = require('ansi-colors'),
  jshint = require('../node/jshint-utils'),
  log = require('fancy-log');

module.exports = function(context) {
  const now = Date.now();
  log("Executing '" + colors.cyan("before_prepare") + "' hook...");

  const projectRoot = context && context.opts && context.opts.projectRoot || '.';
  const platforms = context && context.opts && context.opts.platforms || ['android'];

  const gulpFile = require(path.join(projectRoot, 'gulpfile'));

  if (!projectRoot || !platforms || !gulpFile) return; // Skip

  // Run JS Lint
  return jshint.validate(projectRoot) // new Promise(done => gulpFile.lint(done))
    .then(() => {
      log(colors.grey("Hook 'before_prepare' finished in " + (Date.now() - now) + 'ms'));
    });
}
