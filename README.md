# Cesium

[Unhosted webapp](https://unhosted.org) client for [Duniter](https://duniter.org) network.

Try it at: http://cesium.duniter.fr

## Developer

To contribute and compile cesium, you will have to: 
 
  - Installing [nvm](https://github.com/creationix/nvm)
```
  wget -qO- https://raw.githubusercontent.com/creationix/nvm/v0.31.0/install.sh | bash
```

  - Configure NodeJS to use a version 5:
```
  nvm install 5 
```
      
  - Installing other build dependencies:
```
 sudo apt-get install build-essential
```
   
  - Getting source and installing project dependencies:    
```
  git clone https://github.com/duniter/cesium.git
  cd cesium
  npm install --save
  bower install
```

  - Compiling and running application   
```
  gulp & ionic serve
```

 - To build on another environment:
   - Add your environment config into `app/config.json`
   - Run compitaltion using option `--env`:
```
  gulp default --env <your_env_name> 
```
