#!/usr/bin/env node

const fs = require('fs'),
  path = require('path');

function addPlatformBodyTag(indexPath, platform) {
  // add the platform class to the body tag
  try {
    const platformClass = 'platform-' + platform;
    const cordovaClass = 'platform-cordova platform-webview';

    let html = fs.readFileSync(indexPath, 'utf8');

    const bodyTag = findBodyTag(html);
    if (!bodyTag) return; // no opening body tag, something's wrong

    if (bodyTag.indexOf(platformClass) > -1) return; // already added

    let newBodyTag = bodyTag;

    let classAttr = findClassAttr(bodyTag);
    if (classAttr) {
      // body tag has existing class attribute, add the classname
      let endingQuote = classAttr.substring(classAttr.length - 1);
      let newClassAttr = classAttr.substring(0, classAttr.length - 1);
      newClassAttr += ' ' + platformClass + ' ' + cordovaClass + endingQuote;
      newBodyTag = bodyTag.replace(classAttr, newClassAttr);

    } else {
      // add class attribute to the body tag
      newBodyTag = bodyTag.replace('>', ' class="' + platformClass + ' ' + cordovaClass + '">');
    }

    html = html.replace(bodyTag, newBodyTag);

    fs.writeFileSync(indexPath, html, 'utf8');

    process.stdout.write('add to body class: ' + platformClass + '\n');
  } catch (e) {
    process.stdout.write(e);
  }
}

function findBodyTag(html) {
  // get the body tag
  try {
    return html.match(/<body(?=[\s>])(.*?)>/gi)[0];
  } catch (e) {
  }
}

function findClassAttr(bodyTag) {
  // get the body tag's class attribute
  try {
    return bodyTag.match(/ class=["|'](.*?)["|']/gi)[0];
  } catch (e) {
  }
}

module.exports = function(context) {

  const rootdir = context.opts.projectRoot;
  const platforms = context.opts.platforms;

  if (rootdir && platforms) {

    // go through each of the platform directories that have been prepared
    for (let x = 0; x < platforms.length; x++) {
      // open up the index.html file at the www root
      try {
        const platform = platforms[x].trim().toLowerCase();
        let indexPath;

        if (platform === 'android') {
          //indexPath = path.join(rootdir, 'platforms', platform, 'app', 'src', 'main', 'assets', 'www', 'index.html');
          indexPath = path.join('platforms', platform, 'assets', 'www', 'index.html');
        } else {
          indexPath = path.join('platforms', platform, 'www', 'index.html');
        }

        if (fs.existsSync(indexPath)) {
          addPlatformBodyTag(indexPath, platform);
        }

      } catch (e) {
        process.stdout.write(e);
      }
    }

  }

}
