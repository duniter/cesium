## Building Cesium for Ubuntu

Ionic allow to build native unbuntu application. Using the `click` tool, and the Cordova `ubuntu` platform.

## Install Ubuntu SDK 

Source documentation [here](https://developer.ubuntu.com/en/phone/platform/sdk/installing-the-sdk/) and [here](https://cordova.apache.org/docs/en/latest/guide/platforms/ubuntu/index.html)

Install SDK :

```bash
sudo add-apt-repository ppa:ubuntu-sdk-team/ppa
sudo apt update
sudo apt install ubuntu-sdk
```

Install "click" packaging and dev tools:

```bash
sudo apt-get install click cmake libicu-dev pkg-config devscripts qtbase5-dev qtchooser qtdeclarative5-dev qtfeedback5-dev qtlocation5-dev qtmultimedia5-dev qtpim5-dev libqt5sensors5-dev qtsystems5-dev 

```
> ou alternativement (à tester) : 
> `sudo click chroot -a armhf -f ubuntu-sdk-15.04 install cmake libicu-dev:armhf pkg-config qtbase5-dev:armhf qtchooser qtdeclarative5-dev:armhf qtfeedback5-dev:armhf qtlocation5-dev:armhf qtmultimedia5-dev:armhf qtpim5-dev:armhf libqt5sensors5-dev:armhf qtsystems5-dev:armhf`



## Add Ubuntu platform to Ionic project

```bash
cd cesium
ionic platform add ubuntu
```

## Running Ubuntu SDK IDE (optional)
 
To be able to launch Ubuntu SDK IDE, make sure your user has the unix group 'lxd'. 
 
`sudo usermod -a -G lxd mon_user`

Then launch the command `ubuntu-sdk-ide &` 

## Build Debian package (.deb)

Generate the `click` source code:

```bash
cd cesium
ionic build ubuntu --release
```

Then build the DEB package:
 
```bash
cd platforms/ubuntu/native/fr.duniter.cesium
debuild
```

This should generate `.deb` and description files. 

> This step requires a valid GPG key, to sign the `.deb` file.


### Testing on an Ubuntu phone

```bash
cd cesium
ionic run ubuntu --device
```

## Publishing to Ubuntu App Store

Follow steps on https://developer.ubuntu.com/en/publish/