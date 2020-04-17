FROM     ubuntu:18.04
LABEL maintainer="benoit [dot] lavenier [at] e-is [dot] pro"

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_VERSION=10.20.0 \
    NPM_VERSION=6.14.4 \
    YARN_VERSION=1.22.4 \
    IONIC_CLI_VERSION=6.5.0 \
    CORDOVA_VERSION=8.1.2 \
    GRADLE_VERSION=4.10.3 \
    GULP_VERSION=2.2.0

# Install basics
RUN apt-get update && \
    apt-get install -y git wget curl unzip build-essential software-properties-common ruby ruby-dev ruby-ffi gcc make python && \
    curl --retry 3 -SLO "http://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.gz" && \
    tar -xzf "node-v$NODE_VERSION-linux-x64.tar.gz" -C /usr/local --strip-components=1 && \
    rm "node-v$NODE_VERSION-linux-x64.tar.gz"

RUN mkdir -p /home/root && \
    chmod -R 777 /home/root
WORKDIR /home/root

# Install global nodeJS dependencies
RUN npm install -g npm@"$NPM_VERSION" && \
    npm install -g yarn@"$YARN_VERSION" gulp@"$GULP_VERSION" cordova@"$CORDOVA_VERSION" cordova-res@"$CORDOVA_RES_VERSION" @ionic/cli@"$IONIC_CLI_VERSION" && \
    npm cache clear --force

# Install source code
#RUN git config --global user.email "user.name@domain.com" && \
#    git config --global user.name "User Name" && \
RUN git clone https://git.duniter.org/clients/cesium-grp/cesium.git && \
    cd cesium && \
    yarn install

WORKDIR cesium
EXPOSE 8100 35729
CMD ["yarn", "run", "start"]
