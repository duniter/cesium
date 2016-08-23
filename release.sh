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
  echo "new build version: $2"
  echo "new build android version: $3"
  case "$1" in
    rel|pre)
      # Change the version in package.json and test file
      sed -i "s/version\": \"$current/version\": \"$2/g" package.json
      sed -i "s/ version=\".*\"/ version=\"$2\"/g" config.xml
      sed -i "s/ android-versionCode=\".*\"/ android-versionCode=\"$3\"/g" config.xml

      # Bump the install.sh
      sed -i "s/echo \"v$current\"/echo \"v$2\"/g" install.sh
      ;;
    *)
      echo "No task given"
      ;;
  esac

  # Update config file
  gulp config --env default

  # Commit
  git reset HEAD
  git add package.json config.xml install.sh
  git commit -m "v$2"
  git tag "v$2"
  git push

  # Build assets
  ionic build android --release
  ionic build firefoxos --release
  gulp build:web --release

  if [[ $4 =~ ^[a-zA-Z0-9_]+:[a-zA-Z0-9_]+$ ]]; then
    ./github.sh $1 $2
  fi

  echo "**********************************"
  echo "* Build release succeed !"
  echo "**********************************"
else
  echo "Wrong version format"
  echo "Usage:"
  echo " > ./release.sh [pre|rel] <version> <android-version> <github_credentials>"
  echo "with:"
  echo "  version: x.y.z"
  echo "  android-version: nnn"
  echo "  github_credentials: user:password  (a valid GitHub user account)"
fi

