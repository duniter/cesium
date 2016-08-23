#!/bin/bash

### Control that the script is run on `dev` branch
branch=`git rev-parse --abbrev-ref HEAD`
if [[ ! "$branch" = "master" ]];
then
  echo ">> This script must be run under \`master\` branch"
  exit
fi


### Releasing
current=`grep -P "version\": \"\d+.\d+.\d+(\w*)" package.json | grep -oP "\d+.\d+.\d+(\w*)"`
echo "Current version: $current"
currentAndroid=`grep -P "android-versionCode=\"\d+\"" config.xml | grep -oP "\d+"`
echo "Current Android version: $currentAndroid"

if [[ $2 =~ ^[0-9]+.[0-9]+.[0-9]+((a|b)[0-9]+)?$ && $3 =~ ^[0-9]+$ ]]; then
  echo "build $2"
  case "$1" in
    rel|pre)
      # Change the version in package.json and test file
      sed -i "s/version\": \"$current/version\": \"$2/g" package.json
      sed -i "s/ version=\".*\"/ version=\"$2\"/g" config.xml
      sed -i "s/ android-versionCode=\".*\"/ android-versionCode=\"$3\"/g" config.xml
      ;;
    *)
      echo "No task given"
      ;;
  esac

  # Commit
  git reset HEAD
  case "$1" in
    rel)
      git add package.json config.xml
      ;;
    pre)
      git add package.json config.xml
      ;;
  esac
  git commit -m "v$2"
  git tag "v$2"
else
  echo "Wrong version format"
  echo "Usage:"
  echo " > release.sh [pre|rel] <version> <android-version>"
  echo "with:"
  echo "  - version: x.y.z"
  echo "  - android-version: nnn"
fi

gulp default --env default

ionic build android --release

ionic build firefoxos --release

gulp build:web --release





