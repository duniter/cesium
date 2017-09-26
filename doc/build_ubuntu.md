# Ubuntu Builds

Cesium can be build as desktop application for Ubuntu, or as App on Ubuntu phone. Such builds use cross-architecture [click targets](https://developer.ubuntu.com/en/phone/apps/sdk/tutorials/click-targets-and-device-kits/) and the specific Apache Cordova platform `ubuntu`.

## Install Ubuntu SDK 

Source documentation [here](https://developer.ubuntu.com/en/phone/platform/sdk/installing-the-sdk/) and [here](https://cordova.apache.org/docs/en/latest/guide/platforms/ubuntu/index.html)

Install the SDK :

```bash
sudo add-apt-repository ppa:ubuntu-sdk-team/ppa
sudo apt update
sudo apt install ubuntu-sdk
```

Install "click" packaging tools:

```bash
sudo apt-get install click cmake libicu-dev pkg-config devscripts qtbase5-dev qtchooser qtdeclarative5-dev qtfeedback5-dev qtlocation5-dev qtmultimedia5-dev qtpim5-dev libqt5sensors5-dev qtsystems5-dev 

```
> Alternatively (not tested): 
> `sudo click chroot -a armhf -f ubuntu-sdk-15.04 install cmake libicu-dev:armhf pkg-config qtbase5-dev:armhf qtchooser qtdeclarative5-dev:armhf qtfeedback5-dev:armhf qtlocation5-dev:armhf qtmultimedia5-dev:armhf qtpim5-dev:armhf libqt5sensors5-dev:armhf qtsystems5-dev:armhf`



## Add Ubuntu platform to the Ionic project

```bash
cd cesium
ionic platform add ubuntu
```

## Running Ubuntu SDK IDE (optional)
 
To debug or configure the Ubuntu builds easily, you can use the Ubuntu SDK IDE.
 
```bash
ubuntu-sdk-ide
```

> Note: Before launching the IDE, make sure your user has the unix group `lxd`. If not, simply execute this command:
> `sudo usermod -a -G lxd mon_user`


## Build Debian package 

Cesium can be built on a `amd64` architecture. 

1. Generate the `click` source code:

```bash
cd cesium
ionic build ubuntu --release
```

2. Then build the project:
 
```bash
cd platforms/ubuntu/native/cesium
debuild
```

This should generate the `.deb` in directory `<cesium>/platforms/ubuntu/native`. 

> This step will required a valid (and installed) GPG key, to sign the `.deb` file.
> The key should match the `author` field of the file `<cesium>/config.xml`.
> To be able to your own GPG key, change the author. 

### Build for Ubuntu Phone

Cesium can be built on a `armhf` architecture.

Install `armhf` build platform:

```bash
sudo click chroot -a armhf -f ubuntu-sdk-15.04 create
```

Then install some dependencies inside the `armhf` chroot:  
 
```bash
sudo click chroot -a armhf -f ubuntu-sdk-15.04 install cmake libicu-dev:armhf pkg-config qtbase5-dev:armhf qtchooser qtdeclarative5-dev:armhf qtfeedback5-dev:armhf qtlocation5-dev:armhf qtmultimedia5-dev:armhf qtpim5-dev:armhf libqt5sensors5-dev:armhf qtsystems5-dev:armhf 
```

Build the phone application  

```bash
cd cesium
ionic build ubuntu --device
```

> To test your application on phone, execute :
> `ionic run ubuntu --device`



## Publishing to Ubuntu App Store

Follow steps on https://developer.ubuntu.com/en/publish/