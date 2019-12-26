# Cesium docker image

## Build

```bash
 cd cesium
 docker build . -t cesium/release
```

## Run

```bash
 docker run -ti --net host -p 8100:8100 -p 35729:35729 -v ~/.gradle:/root/.gradle -v \$PWD:/cesium:rw --privileged cesium/release
```