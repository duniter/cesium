FROM     ubuntu:16.04
LABEL maintainer="benoit [dot] lavenier [at] e-is [dot] pro"

ENV DEBIAN_FRONTEND=noninteractive \
    ANDROID_HOME=/opt/android-sdk-linux \
    NODE_VERSION=6.17.1 \
    NPM_VERSION=6.13.4 \
    IONIC_VERSION=1.7.16 \
    CORDOVA_VERSION=9.0.0 \
    GRADLE_VERSION=4.1 \
    GULP_VERSION=2.2.0 \
    ANDROID_NDK_VERSION=r19c \
    ANDROID_SDK_VERSION=r29.0.0

# Install basics
RUN apt-get update &&  \
    apt-get install -y git wget curl unzip build-essential ruby ruby-dev ruby-ffi gcc make python && \
    curl --retry 3 -SLO "http://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.gz" && \
    tar -xzf "node-v$NODE_VERSION-linux-x64.tar.gz" -C /usr/local --strip-components=1 && \
    rm "node-v$NODE_VERSION-linux-x64.tar.gz"

# Install global nodeJS dependencies
RUN npm install -g npm@"$NPM_VERSION" && \
    npm install -g yarn gulp@"$GULP_VERSION" cordova@"$CORDOVA_VERSION" ionic@"$IONIC_VERSION" && \
    npm cache clear --force

# Install global nodeJS dependencies
RUN yarn install node-sass@3.13.1

# Install Java
RUN apt-get update && apt-get install -y -q python-software-properties software-properties-common  && \
    add-apt-repository ppa:webupd8team/java -y && \
    echo oracle-java8-installer shared/accepted-oracle-license-v1-1 select true | /usr/bin/debconf-set-selections && \
    apt-get update && apt-get -y install oracle-java8-installer

# ANDROID STUFF
RUN echo ANDROID_HOME="${ANDROID_HOME}" >> /etc/environment && \
    dpkg --add-architecture i386 && \
    apt-get update && \
    apt-get install -y --force-yes expect ant wget zipalign libc6-i386 lib32stdc++6 lib32gcc1 lib32ncurses5 lib32z1 qemu-kvm kmod && \
    apt-get clean && \
    apt-get autoclean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Install Android SDK
RUN cd /opt && \
    wget --output-document=android-sdk.tgz --quiet http://dl.google.com/android/android-sdk_"$ANDROID_SDK_VERSION"-linux.tgz && \
    tar xzf android-sdk.tgz && \
    rm -f android-sdk.tgz && \
    chown -R root. /opt

RUN cd /opt/ && \
  wget --output-document=android-ndk.zip --quiet  https://dl.google.com/android/repository/android-ndk-"$ANDROID_NDK_VERSION"-linux-x86_64.zip && \
  unzip android-ndk.zip && \
  rm android-ndk.zip && \
  chown -R root. /opt

# Install Gradle
RUN wget https://services.gradle.org/distributions/gradle-"$GRADLE_VERSION"-bin.zip && \
    mkdir /opt/gradle && \
    unzip -d /opt/gradle gradle-"$GRADLE_VERSION"-bin.zip && \
    rm -rf gradle-$"GRADLE_VERSION"-bin.zip

# Setup environment

ENV PATH ${PATH}:${ANDROID_HOME}/tools:${ANDROID_HOME}/platform-tools:/opt/tools:/opt/gradle/gradle-"$GRADLE_VERSION"/bin

# Install sdk elements
COPY resources/android/build/tools /opt/tools
RUN chmod u+x /opt/tools/*.sh
RUN ["/opt/tools/android-accept-licenses.sh", "android update sdk --all --no-ui --filter platform-tools,tools,build-tools-26.0.0,android-26,build-tools-25.0.0,android-25,extra-android-support,extra-android-m2repository,extra-google-m2repository"]
RUN unzip ${ANDROID_HOME}/temp/*.zip -d ${ANDROID_HOME}


# Install source code
#RUN git config --global user.email "user.name@domain.com" && \
#    git config --global user.name "User Name" && \
RUN git clone git@git.duniter.org:clients/cesium-grp/cesium.git && \
    cd cesium && \
    yarn install --ignore-engines

# Restore cordova platforms
RUN cd cesium && \
    ionic state restore

# TODO: Test First Build so that it will be faster later
##  ionic cordova build android --prod --no-interactive --release

WORKDIR cesium
EXPOSE 8100 35729
CMD ["ionic", "serve"]
