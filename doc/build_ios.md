# Build Cesium for iOS

Cesium can be build as desktop application for iOS. .

## Prerequisites

### Install an OSx VM

Cesium comes with ready to use `Vagrantfile`, used to start a OSx VM easily.

1. Install VirtualBox

2. Install Vagrant 

3. Make sure [Cesium-desktop](https://git.duniter.org/clients/cesium-grp/cesium-desktop) has been checkout inside the path `/platforms/desktop/` (or anywhere else).
   This should have been done, if you followed the installation steps.  

4. On a terminal, go inside [platforms/desktop/arch/osx/](../platforms/desktop/arch/osx/), then start the VM:
```bash
cd platforms/desktop/arch/osx/
vagrant up --provision
```

5. Connect to the VM: 
```bash
vagrant ssh
```

6. Execute the build
```
./build-osx.sh
```
This should download Cesium sources in `Downloads/cesium_src` and binaries web artifact in `Downloads/cesium`.

## Installing XCode 8 (XIP file) 

1. Download Xcode (8.2.1) : https://developer.apple.com/services-account/download?path=/Developer_Tools/Xcode_8.2.1/Xcode_8.2.1.xip

2. Copy the `.xip` file into directory `platforms/desktop/arch/osx/`

3. Make sure to restart the VM (this is required to copy the XIP file)
```bash
vagrant halt
vagrant up
vagrant ssh
```
4. Unpack the XIP file
```bash
unxip Xcode*.xip
```
5. Install Xcode into `/Applications`, then configure xcode-select
```bash
sudo mv Xcode.app /Applications 
```
6. Configure `xcode-select`:
```bash
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
```

## Install Node JS

1. Install NVM (node.js version manager) :
2. Install node.js v5  
3. Install common node.js dependencies
 
```bash
# NVM (Node version manager
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.1/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm

# Node.js
nvm install 6

# node-pre-gyp
npm install -g nw-gyp node-pre-gyp
```

## Build from source

1. Checkout Cesium source, from git, inside the directory `/Users/vagrant/Downloads/cesium_src`

2. Install global dependencies (see [Development Guide](./development_guide.md) for versions to used) :
```
npm install -g yarn gulp cordova @ionic/cli@6.20.9
```

3. Install project dependencies :
```
cd cesium_src
npm install
```

4. Prepare ionic, to build on ios:
```bash
ionic platform add ios
ionic state reset
```

5. Run cesium:
```bash
ionic run ios
```

6. Build binaries for emulator :

```bash
ionic build ios
```


## Publishing to Apple store

### Pre-requisite

Ensure you have a valid Certificate (with your private key) 
and Distribution Provisioning Profile associated to it in the OSX Keychain.

See: https://help.apple.com/developer-account/#/devbfa00fef7

### Archive and upload to Apple Store Connect

1. Prepare for iOS in release mode:

```bash
ionic prepare ios --release --prod
```

2. Generate archive for iOS generic device
```bash
cd platforms/ios
mkdir build
xcodebuild -workspace Cesium.xcworkspace -scheme Cesium -sdk iphoneos -configuration AppStoreDistribution archive -archivePath $PWD/build/Cesium.xcarchive
```

4. Create an `export.plist` file with the following content
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store</string>
    <key>teamID</key>
    <string>YOUR_TEAM_ID</string>
</dict>
</plist>
```

Replace `YOUR_TEAM_ID` by the Team ID associated to your Apple Developer Account (see Membership section on https://developer.apple.com/account/)

3. generate IPA for Apple Store
```bash
xcodebuild -exportArchive -archivePath $PWD/build/Cesium.xcarchive -exportOptionsPlist $PWD/export.plist -exportPath $PWD/build
```

4. Upload to Apple Store Connect:
```bash
/Applications/Xcode.app/Contents/Applications/Application\ Loader.app/Contents/Frameworks/ITunesSoftwareService.framework/Support/altool --upload-app -f $PWD/build/Cesium.ipa -u YOUR_APPLE_ID
```

The command will prompt for your password, if you use two-factor authentication, you'll need to generate an application specific password for this command (see: https://appleid.apple.com/account/manage)

5. Go to `https://appstoreconnect.apple.com/`, then `My Apps` and publish your App from there.