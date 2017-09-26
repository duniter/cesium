# Android Builds

Cesium can be build as Android App.

## Prerequisites

### Install build tools

```
sudo apt-get install build-essential
```

### Install libsodium 

[The Sodium crypto library (libsodium)](https://download.libsodium.org/doc/installation/) is a modern, easy-to-use software library for encryption, decryption, signatures, password hashing and more. 

- Get libsodium
```
    wget -kL https://github.com/jedisct1/libsodium/releases/download/1.0.11/libsodium-1.0.11.tar.gz
    tar -xvf libsodium-1.0.11.tar.gz
```

- Installation:
```
    cd libsodium-1.0.11
    sudo apt-get install build-essential
    sudo ./configure
    sudo make && make check
    sudo make install        
```


### Install NodeJS 5

Cesium need NodeJS v5. You can install it the [this download page](https://nodejs.org/download/release/v5.12.0/), but we recommand the use of MVN (Node Version Manager). 
MV? help you to manage many versions of NodeJS. 

 - Install [MVN](https://github.com/creationix/nvm):  
```bash
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.31.1/install.sh | bash
```

 - Open a new terminal (to reload environment), then install NodeJS 5 : 
```bash
nvm install 5
```


### Install JDK (Java Development Kit)

You can choose to install
 
- on Linux, OpenJDK 8
 
  * ``sudo apt-get install openjdk-8-jdk``
    
- or Oracle JDK 8 (all platforms supported) :
  
   * Download it from [Oracle web site](http://www.oracle.com/technetwork/java/javase/downloads/jdk8-downloads-2133151.html)
   
   <img src="./fr/img/fef4f4dfe7c2168cb27c9e7f5e399fd547ce774a.png" width="400">

   And choose the right version, depending on your platform.

### Install Android Studio


Download Android Studio from the [AndroidStudio-Downloads page](https://developer.android.com/studio/index.html#downloads)

 - On MS Windows
  
  * Download file **without** the Android SDK:
  <img src="./fr/img/3b8fa2f5c0465b13ae5ce74d49702e0c9f027866.png" width="690" height="237">
  
   * Then follow installation steps.

 - On Linux : 
 
  * download the full archive, then uncompress it (e.g in `/opt/android-sdk`).

  * open a terminal, run the command:
  ```bash
  ./bin/studio.sh
  ```

At the end of the installation or the first launch, Android Studio will indicate that you do not have an SDK and will propose to install it.

Install the version that it proposes to you.

### Install Android NDK

> The NDK is used for code execution in C ++, including the NaCL cryptography library.

 - Download NDK from [this page](https://developer.android.com/ndk/downloads/index.html)

   * **Warning**: Please use version `r10d` (not tested on newer versions).

 - Uncompress the archive (e.g on Linux, in a new directory `/opt/android-ndk`).

 - Launch Android-studio, then open the menu `File > Project Structure...`

  <img src="./img/04e64b769cbd45b9d275cd5f81002a399a1a7684.png" width="300">

 - A window like this should open: 

  <img src="./img/ceb75301172038e75f5c43b328dd7febd7bedc7e.png" width="450">

 - Fill in the installation path of the NDK.

## Get source and dependencies

 - Get Cesium sources:
```bash
git clone https://github.com/duniter/cesium.git
cd cesium
```

 - Install dependencies (global then project's dependencies):
```bash
npm install -g gulp bower@1.8.0 cordova@6.5.0 ionic@1.7.16
npm install
```

 - Install Cordova plugins:
```
ionic state restore
```

 - This should create a new directory `platforms/android`

> To remind: check that your command line is configured:
> - You must place yourself in the directory of the application: `cd cesium`
> - and be configured for NodeJs v5: `nvm use 5` (please chek using the command `node --version`)

## Android configuration

Android need some configuration, to be able to build Cesium.

 - First, create a properties file `local.properties` in the directory `platforms/android`:
 
```properties
# Path to your Android SDK installation
sdk.dir=/opt/android-sdk

# Path to your Android NDK installation
ndk.dir=/opt/android-ndk
```

 - In order to sign your Android builds, create a file `release-signing.properties` :
```properties
storeFile=Cesium.keystore
keyAlias=Cesium
storePassword=YourStorePassword
keyPassword=YourKeyPassword
```
 
 > Make sure to put your keystore file in the same path. 
 > To generate a new keystore file, use:
 > `keytool -genkey -v -keystore Cesium.keystore -alias Cesium -keyalg RSA -keysize 2048 -validity 10000`


## Generate APK file

 - Run the Android Build, to the signed APK file:
```
ionic build android --release
```

 - To get unsigned (debug) APK, run:
```
ionic build android
```

Generated APK files should be in directory `platforms/android/build/outputs/apk`

### Troubleshooting

#### "Cannot run program (...)/aapt"

If you get this error:

  ```
  Cannot run program "/opt/android-sdk/build-tools/21.1.2/aapt": error=2, No such file or folder
  ```

Install two additional compatibility libraries (workaround found [this post](http://stackoverflow.com/questions/22701405/aapt-ioexception-error-2-no-such-file-or-directory-why-cant-i-build-my-grad)):                            
```bash
sudo apt-get install lib32stdc++6 lib32z1
```
