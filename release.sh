#!/bin/sh

gulp default --env default

ionic build android --release

gulp build:web



