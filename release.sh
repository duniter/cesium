#!/bin/bash

### Control that the script is run on `dev` branch
branch=`git rev-parse --abbrev-ref HEAD`
if [[ ! "$branch" = "master" ]];
then
  echo ">> This script must be run under \`master\` branch"
  exit
fi

DIRNAME=`pwd`

### Releasing
current=`grep -P "version\": \"\d+.\d+.\d+(\w*)" package.json | grep -oP "\d+.\d+.\d+(\w*)"`
echo "Current version: $current"
currentAndroid=`grep -P "android-versionCode=\"\d+\"" config.xml | grep -oP "\d+"`
echo "Current Android version: $currentAndroid"

if [[ $2 =~ ^[0-9]+.[0-9]+.[0-9]+((a|b)[0-9]+)?$ && $3 =~ ^[0-9]+$ ]]; then
  echo "new build version: $2"
  echo "new build android version: $3"
  case "$1" in
    rel|pre)
      # Change the version in package.json and test file
      sed -i "s/version\": \"$current/version\": \"$2/g" package.json
      sed -i "s/ version=\".*\"/ version=\"$2\"/g" config.xml
      sed -i "s/ android-versionCode=\".*\"/ android-versionCode=\"$3\"/g" config.xml

      # Bump the install.sh
      sed -i "s/echo \"v.*\" #lastest/echo \"v$2\" #lastest/g" install.sh
      ;;
    *)
      echo "No task given"
      ;;
  esac

  # Update config file
  gulp config --env default_fr

  # Build assets for mobile device
  ionic build android --release
  ionic build firefoxos --release

  # Update config file
  gulp config --env default
  gulp build:web --release
  ionic build ubuntu --release
  cd platforms/ubuntu/native/cesium; debuild
  cd $DIRNAME

  # Commit
  git reset HEAD
  git add package.json config.xml install.sh www/js/config.js
  git commit -m "v$2"
  git tag "v$2"
  git push

  echo "**********************************"
  echo "* Build release succeed !"
  echo "**********************************"

  if [[ $4 =~ ^[a-zA-Z0-9_]+:[a-zA-Z0-9_]+$ && "_$5" != "_" ]]; then
    ./github.sh $1 $4 "'"$5"'"
  else
    echo " WARN - missing arguments: "
    echo "       user:password 'release_description'"
    echo
    echo "   Binaries files NOT sending to github repository"
    echo "   Please run:"
    echo "  > ./github.sh pre|rel user:password 'release_description'"
    echo
  fi

else
  echo "Wrong version format"
  echo "Usage:"
  echo " > ./release.sh [pre|rel] <version> <android-version> <github_credentials>"
  echo "with:"
  echo "  version: x.y.z"
  echo "  android-version: nnn"
  echo "  github_credentials: user:password  (a valid GitHub user account)"
fi

