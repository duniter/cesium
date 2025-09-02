FROM     ubuntu:18.04
LABEL maintainer="benoit [dot] lavenier [at] e-is [dot] pro"

ENV DEBIAN_FRONTEND=noninteractive \
    ANDROID_SDK_ROOT=/opt/android-sdk-linux \
    NODE_VERSION=16.20.2 \
    NPM_VERSION=8.19.4 \
    YARN_VERSION=1.22.22 \
    IONIC_CLI_VERSION=6.20.9 \
    CORDOVA_VERSION=12.0.0 \
    CORDOVA_RES_VERSION=0.15.4 \
    NATIVE_RUN_VERSION=2.0.0 \
    GRADLE_VERSION=8.7 \
    GULP_VERSION=4.0.2 \
    ANDROID_NDK_VERSION=r19c \
    ANDROID_SDK_VERSION=r29.0.2

# Install basics
RUN apt-get update &&  \
    apt-get install -y git wget curl unzip build-essential software-properties-common ruby ruby-dev ruby-ffi gcc make python && \
    curl --retry 3 -SLO "http://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.gz" && \
    tar -xzf "node-v$NODE_VERSION-linux-x64.tar.gz" -C /usr/local --strip-components=1 && \
    rm "node-v$NODE_VERSION-linux-x64.tar.gz"

# Install global nodeJS dependencies
RUN npm install -g npm@"$NPM_VERSION" && \
    npm install -g yarn@"$YARN_VERSION" gulp@"$GULP_VERSION" cordova@"$CORDOVA_VERSION" cordova-res@"$CORDOVA_RES_VERSION" @ionic/cli@"$IONIC_CLI_VERSION" && \
    npm cache clear --force


# Install Cordova
RUN npm install -g cordova@"$CORDOVA_VERSION" cordova-res@"$CORDOVA_RES_VERSION" native-run@"$NATIVE_RUN_VERSION" && \
    npm cache clear --force

# Install Android prerequisites
RUN echo ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT}" >> /etc/environment && \
    dpkg --add-architecture i386 && \
    apt-get update && \
    apt-get -y install openjdk-11-jdk-headless && \
    apt-get install -y --force-yes expect ant wget zipalign libc6-i386 lib32stdc++6 lib32gcc1 lib32ncurses5 lib32z1 qemu-kvm kmod && \
    apt-get clean && \
    apt-get autoclean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Install Android SDK
#RUN cd /opt && \
#    wget --output-document=android-sdk.tgz --quiet http://dl.google.com/android/android-sdk_"$ANDROID_SDK_VERSION"-linux.tgz && \
#    tar xzf android-sdk.tgz && \
#    rm -f android-sdk.tgz && \
#    chown -R root. /opt
#
## Install Android NDK
#RUN cd /opt/ && \
#  wget --output-document=android-ndk.zip --quiet  https://dl.google.com/android/repository/android-ndk-"$ANDROID_NDK_VERSION"-linux-x86_64.zip && \
#  unzip android-ndk.zip && \
#  rm android-ndk.zip && \
#  chown -R root. /opt

# Install Gradle
#RUN cd /opt/ && \
#    wget https://services.gradle.org/distributions/gradle-"$GRADLE_VERSION"-bin.zip && \
#    mkdir /opt/gradle && \
#    unzip -d /opt/gradle gradle-"$GRADLE_VERSION"-bin.zip && \
#    rm -rf gradle-$"GRADLE_VERSION"-bin.zip

# Setup environment

#ENV PATH ${PATH}:${ANDROID_SDK_ROOT}/tools:${ANDROID_SDK_ROOT}/platform-tools:/opt/tools:/opt/gradle/gradle-"$GRADLE_VERSION"/bin

# Install sdk elements
#COPY resources/android/build/tools /opt/tools
#RUN chmod u+x /opt/tools/*.sh
#RUN ["/opt/tools/android-accept-licenses.sh", "android update sdk --all --no-ui --filter platform-tools,tools,build-tools-29.0.0,android-29,build-tools-26.0.0,android-26,build-tools-25.0.0,android-25,extra-android-support,extra-android-m2repository,extra-google-m2repository"]
#RUN unzip ${ANDROID_SDK_ROOT}/temp/*.zip -d ${ANDROID_SDK_ROOT}


# Install source code
#RUN git config --global user.email "user.name@domain.com" && \
#    git config --global user.name "User Name" && \
RUN git clone https://git.duniter.org/clients/cesium-grp/cesium.git && \
    cd cesium && \
    yarn install --ignore-engines

# Restore cordova platforms
RUN cd cesium && \
    yarn run install-platforms

# TODO: Test First Build so that it will be faster later
##  ionic cordova build android --prod --no-interactive --release

WORKDIR cesium
EXPOSE 8100 35729
CMD ["yarn", "run", "start"]
