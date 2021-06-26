FROM  node:12
LABEL maintainer="benoit [dot] lavenier [at] e-is [dot] pro"
LABEL version="1.6.12"
LABEL description="Cesium Wallet for Ğ1 libre currency"

ARG CESIUM_VER="1.6.12"

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_VERSION=12.21.0 \
    NPM_VERSION=7.14.0 \
    YARN_VERSION=1.22.10 \
    IONIC_CLI_VERSION=6.16.3 \
    CORDOVA_VERSION=10.0.0 \
    GRADLE_VERSION=6.5.1 \
    GULP_VERSION=4.0.2

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

RUN test -f package.json || git clone https://github.com/duniter/cesium.git && cd cesium

# Install project dependencies
# Workaround need for node-sass (- )see https://github.com/yarnpkg/yarn/issues/4867)
RUN yarn install --ignore-engines && \
    yarn remove node-sass && yarn add node-sass

WORKDIR /cesium
EXPOSE 8100 35729
CMD ["yarn", "run", "start"]
