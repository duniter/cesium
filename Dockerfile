FROM  node:10-alpine
LABEL maintainer="benoit [dot] lavenier [at] e-is [dot] pro"
LABEL version="1.6.3"
LABEL description="Cesium Wallet for Ğ1 libre currency"

ARG CESIUM_VER="1.6.3"

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_VERSION=10.20.0 \
    NPM_VERSION=6.14.4 \
    YARN_VERSION=1.22.4 \
    IONIC_CLI_VERSION=6.6.0 \
    CORDOVA_VERSION=8.1.2 \
    GRADLE_VERSION=4.10.3 \
    GULP_VERSION=3.9.1

# Install basics
RUN apk update && \
        apk add ca-certificates wget curl git && \
        update-ca-certificates && \
    apk add --update python make g++

# create group and user cesium
RUN addgroup -S -g 1111 cesium && \
	adduser -SD -h /cesium -G cesium -u 1111 cesium
#RUN mkdir -p /var/lib/cesium /etc/cesium && chown cesium:cesium /var/lib/cesium /etc/cesium

# Install global dependencies
RUN yarn global add gulp@"$GULP_VERSION" @ionic/cli@"$IONIC_CLI_VERSION"

# copy source tree
COPY ./ ./

# Install project dependencies
# Workaround need for node-sass (- )see https://github.com/yarnpkg/yarn/issues/4867)
RUN yarn install --ignore-engines && \
    yarn remove node-sass && yarn add node-sass

WORKDIR /cesium
EXPOSE 8100 35729
CMD ["yarn", "run", "start"]
