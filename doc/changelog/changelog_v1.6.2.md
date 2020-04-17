# Version v1.6.2

## All platforms

- [enh] Improve private message icon, on a identity profile - fix [#900](https://git.duniter.org/clients/cesium-grp/cesium/-/issues/900)
- [enh] Improve avatar modal, when editing a Cesium+ profile:
  * allow drag and drop;
  * add a "previous" button;
  
- [fix] Fix some ES translations
- [fix] API: error 'qrcode not defined' - fix [#903](https://git.duniter.org/clients/cesium-grp/cesium/-/issues/903)

### Desktop

- [enh] Add a splash screen

- [fix] Fix command line option `--debug`
- [fix] Open popup to select local Duniter node, if detected  

### Android

- [enh] Fix Android 10 compatibility (due to secure storage Cordova plugin) - fix [#908](https://git.duniter.org/clients/cesium-grp/cesium/-/issues/898)

### Firefox and Chrome extension

- [fix] Unable to set avatar and page's pictures - fix [#904](https://git.duniter.org/clients/cesium-grp/cesium/-/issues/904)

### Build from source

Before building Cesium, please launch this commands:
```bash 
cd cesium

# Update ionic CLI to latest 
npm remove ionic

npm i -g @ionic/cli

# Remove JS dependencies
rm -rf node_modules

# Clean Yarn cache, then install deps
yarn cache clean && yarn install

# Remove Cordova plugins
rm -rf plugins
  
# Re install Cordova plugins
cd scripts
./ionic-update.sh 
```