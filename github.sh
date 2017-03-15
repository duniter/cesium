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

case "$1" in
  del)
    if [[ $2 =~ ^[a-zA-Z0-9_]+:[a-zA-Z0-9_]+$ ]]; then
      result=`curl -i 'https://api.github.com/repos/duniter/cesium/releases/tags/v'"$current"''`
      release_url=`echo "$result" | grep -P "\"url\": \"[^\"]+"  | grep -oP "https://api.github.com/repos/duniter/cesium/releases/\d+"`
      if [[ $release_url != "" ]]; then
        echo "Deleting existing release..."
        curl -XDELETE $release_url -u $2
      fi
    else
      echo "Wrong argument"
      echo "Usage:"
      echo " > ./github.sh del user:password"
      exit
    fi
  ;;

  pre|rel)
    if [[ $2 =~ ^[a-zA-Z0-9_]+:[a-zA-Z0-9_]+$ && $3 != "" ]]; then

      if [[ $1 = "pre" ]]; then
        prerelease="true"
      else
        prerelease="false"
      fi

      result=`curl -i 'https://api.github.com/repos/duniter/cesium/releases/tags/v'"$current"''`
      release_url=`echo "$result" | grep -P "\"url\": \"[^\"]+"  | grep -oP "https://api.github.com/repos/duniter/cesium/releases/\d+"`
      if [[ $release_url != "" ]]; then
        echo "Deleting existing release..."
        curl -XDELETE $release_url -u $2
      fi

      echo "Creating new release..."
      result=`curl -i https://api.github.com/repos/duniter/cesium/releases -u $2 -d '{"tag_name": "v'"$current"'","target_commitish": "master","name": "'"$current"'","body": "'"$3"'","draft": false,"prerelease": '"$prerelease"'}'`
      upload_url=`echo "$result" | grep -P "\"upload_url\": \"[^\"]+"  | grep -oP "https://[a-z0-9/.]+"`

      ###  Sending files
      echo "Uploading files to GitHub..."
      dirname=`pwd`
      curl -i -u $2 -H 'Content-Type: application/zip' -T $dirname/platforms/web/build/cesium-web-$current.zip $upload_url?name=cesium-v$current-web.zip
      curl -i -u $2 -H 'Content-Type: application/zip' -T $dirname/platforms/firefoxos/build/package.zip $upload_url?name=cesium-v$current-firefoxos.zip
      curl -i -u $2 -H 'Content-Type: application/vnd.android.package-archive' -T $dirname/platforms/android/build/outputs/apk/android-release.apk $upload_url?name=cesium-v$current-android.apk
      curl -i -u $2 -H 'Content-Type: application/x-debian-package' -T $dirname/platforms/ubuntu/native/cesium_$current_amd64.deb $upload_url?name=cesium-v$current-ubuntu_x64.deb

      echo "Successfully uploading files"
      release_url=`echo "$result" | grep -P "\"url\": \"[^\"]+"  | grep -oP "https://api.github.com/repos/[a-z0-9/.]+"`
      echo " -> Release url: $release_url"
    else
      echo "Wrong arguments"
      echo "Usage:"
      echo " > ./github.sh pre|rel user:password <release_description>"
      echo "With:"
      echo " - pre: use for pre-release"
      echo " - rel: for full release"
      exit
    fi
    ;;
  *)
    echo "No task given"
    ;;
esac




