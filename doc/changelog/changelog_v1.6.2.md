# Version v1.6.0

## All platforms

- [fix] Fix some ES translations

### Desktop

- [enh] Add a splash screen

### Android

- [enh] Fix Android 10 secure storage 

### Firefox and Chrome extension

- [fix] Fix profile avatar and page's pictures

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