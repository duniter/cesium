#!/bin/bash

### Control that the script is run on `dev` branch
branch=`git rev-parse --abbrev-ref HEAD`
if [[ ! "$branch" = "master" ]];
then
  echo ">> This script must be run under \`master\` branch"
  exit -1
fi


### Releasing
current=`grep -P "version\": \"\d+.\d+.\d+(\w*)" package.json | grep -oP "\d+.\d+.\d+(\w*)"`
echo "Current version: $current"

### Get repo URL
REPO="duniter/cesium"
REPO_URL=https://api.github.com/repos/$REPO

###  get auth token
GITHUB_TOKEN=`cat ~/.config/duniter/.github`
if [[ "_$GITHUB_TOKEN" != "_" ]]; then
    GITHUT_AUTH="Authorization: token $GITHUB_TOKEN"
else
    echo "Unable to find github authentifcation token file: "
    echo " - You can create such a token at https://github.com/settings/tokens > 'Generate a new token'."
    echo " - Then copy the token and paste it in the file '~/.config/duniter/.github' using a valid token."
    exit -1
fi

case "$1" in
  del)
    result=`curl -i "$REPO_URL/releases/tags/v$current"`
    release_url=`echo "$result" | grep -P "\"url\": \"[^\"]+"  | grep -oP "$REPO_URL/releases/\d+"`
    if [[ $release_url != "" ]]; then
        echo "Deleting existing release..."
        curl -H 'Authorization: token $GITHUB_TOKEN'  -XDELETE $release_url
    fi
  ;;

  pre|rel)
    if [[ $2 != "" ]]; then

      if [[ $1 = "pre" ]]; then
        prerelease="true"
      else
        prerelease="false"
      fi
      description="$2"

      result=`curl -s -H ''"$GITHUT_AUTH"'' "$REPO_URL/releases/tags/v$current"`
      release_url=`echo "$result" | grep -P "\"url\": \"[^\"]+" | grep -oP "https://[A-Za-z0-9/.-]+/releases/\d+"`
      if [[ $release_url != "" ]]; then
        echo "Deleting existing release..."
        result=`curl -H ''"$GITHUT_AUTH"'' -XDELETE $release_url`
        if [[ "_$result" != "_" ]]; then
            error_message=`echo "$result" | grep -P "\"message\": \"[^\"]+" | grep -oP ": \"[^\"]+\""`
            echo "Delete existing release failed with error$error_message"
            exit -1
        fi
      else
        echo "Release not exists yet on github."
      fi

      echo "Creating new release..."
      echo " - tag: v$current"
      echo " - description: $description"
      result=`curl -H ''"$GITHUT_AUTH"'' -i $REPO_URL/releases -d '{"tag_name": "v'"$current"'","target_commitish": "master","name": "'"$current"'","body": "'"$description"'","draft": false,"prerelease": '"$prerelease"'}'`
      #echo "DEBUG - $result"
      upload_url=`echo "$result" | grep -P "\"upload_url\": \"[^\"]+"  | grep -oP "https://[A-Za-z0-9/.-]+"`

      ###  Sending files
      echo "Uploading files to $upload_url"
      dirname=`pwd`
      curl -s -H ''"$GITHUT_AUTH"'' -H 'Content-Type: application/zip' -T $dirname/platforms/web/build/cesium-v$current-web.zip $upload_url?name=cesium-v$current-web.zip
      curl -s -H ''"$GITHUT_AUTH"'' -H 'Content-Type: application/vnd.android.package-archive' -T $dirname/platforms/android/build/outputs/apk/release/android-release.apk $upload_url?name=cesium-v$current-android.apk

      echo "Successfully uploading files"
      echo " -> Release url: https://github.com/$REPO/releases/tag/v$current"
    else
      echo "Wrong arguments"
      echo "Usage:"
      echo " > ./github.sh pre|rel <release_description>"
      echo "With:"
      echo " - pre: use for pre-release"
      echo " - rel: for full release"
      exit -1
    fi
    ;;
  *)
    echo "No task given"
    exit -1
    ;;
esac




