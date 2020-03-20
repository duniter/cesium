# Build Cesium as a Web extension

Cesium can be build as Web extension, for Mozilla Firefox extension (`.xpi`) and Chrome/Chromium (`.crx`).

## Prerequisites

### Install the development environment

Follow all the steps defined in the [Development guide](./development_guide.md).

After that you should be able to start the application using `npm start`or `yarn run start`, and to test it.

## Build the web extension


- To create a uncompressed extension, use :
  ```bash
     cd cesium
     gulp webExtensionCopyFiles --release
  ```
  
  The uncompressed web extension will be visible `dist/web/ext`
  
- To create a portable and compressed ZIP extension : 
  ```bash
     cd cesium
     gulp webExtBuild --release
  ```
  
  The web extension is visible at `dist/web/build/cesium-vx.y.z-extension.zip`

> Remove the option `--release` to skip creation of minified CSS and JS files (and source maps)

## Publishing to Mozilla Addons 

- Make sure you have `web-ext` installed. If not, run:
  ```bash
     npm install -g web-ext
  ```
  
- Sign your extension :
  ```bash
  
    # Define your credentials on addons.mozilla.org (your developer account)
    export AMO_JWT_ISSUER =   // username
    export AMO_JWT_SECRET =   // password
  
    # Will archive and upload your extension 
    cd cesium
    web-ext sign "--api-key=${AMO_JWT_ISSUER}" "--api-secret=${AMO_JWT_SECRET}" "--source-dir=dist/web/ext" "--artifacts-dir=${PROJECT_DIR}/dist/web/build"  --id=${WEB_EXT_ID} --channel=listed
  ``` 