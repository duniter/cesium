#!/usr/bin/env node

const log = require('fancy-log'),
  colors = require('ansi-colors'),
  jshint = require('../node/jshint-utils');

module.exports = function(context) {
  const now = Date.now();
  log("Executing '" + colors.cyan("before_prepare") + "' hook...");

  const projectRoot = context && context.opts && context.opts.projectRoot || '.';
  const platforms = context && context.opts && context.opts.platforms || ['android'];
  if (!projectRoot || !platforms) return; // Skip

  // Run JS Lint
  return jshint.validate(projectRoot)
    .then(() => {
      log(colors.grey("Hook 'before_prepare' finished in " + (Date.now() - now) + 'ms'));
    });
}
