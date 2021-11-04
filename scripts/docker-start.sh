#!/bin/bash

# Get to the root project
if [[ "_" == "_${PROJECT_DIR}" ]]; then
  SCRIPT_DIR=$(dirname $0)
  PROJECT_DIR=$(cd ${SCRIPT_DIR}/.. && pwd)
  export PROJECT_DIR
fi;

cd ${PROJECT_DIR}

CMD="sudo docker run -ti --rm -p 8100:8100 -p 35729:35729 -v ${PROJECT_DIR}:/cesium:rw cesium:release"
echo "Executing: $CMD"
$CMD
