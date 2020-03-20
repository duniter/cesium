# Build Cesium as an unhosted web application

Cesium can be build as a simple web application, portable and runnable anywhere.

## Prerequisites

### Install the development environment

Follow all the steps defined in the [Development guide](./development_guide.md).

After that you should be able to start the application using `npm start`or `yarn run start`, and to test it.

## Build the unhosted web application


- To create a compressed ZIP artifact, run:
  ```bash
     cd cesium
     gulp webBuild --release
  ```
  
  A ZIP archive will be visible `dist/web/build/cesium-vx.y.z.zip`

## Publishing to a web site 

Uncompress the web archive, then open the `ìndex.html` file in your web browser.