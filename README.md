![Cesium logo](https://raw.github.com/duniter/cesium/master/cesium-logo.large.blue.sand-dune-250×250.png)

# Cesium

[Unhosted webapp](https://unhosted.org) client for [Duniter](https://duniter.org) network.

Try it at: http://cesium.duniter.fr

There is a [package](https://github.com/duniter/cesium_ynh) for [YunoHost self-hosting distribution](https://yunohost.org).

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
      
  - Installing nodejs build tools:
```
   npm install -g bower gulp ionic cordova
```

  - Installing other build dependencies:
```
 sudo apt-get install build-essential
```
   
   
  - Getting source and installing project dependencies:    
```
  git clone https://github.com/duniter/cesium.git
  cd cesium
  npm install
  bower install
  ionic state restore
```
  - Installing Cordova plugins    
```
  ionic state restore
```

  - Compiling and running application   
```
  gulp & ionic serve
```

### Manage configuration

 - To build on another environment :
   - Add your environment config into `app/config.json`
   - Run compitaltion using option `--env`:
```
  gulp default --env <your_env_name> 
```

### Best pratices

 Cesium could be run on phone devices. Please read [performance tips on AgularJS + Ionic ](http://julienrenaux.fr/2015/08/24/ultimate-angularjs-and-ionic-performance-cheat-sheet/)
 before starting to contribute.
 Read also [Angular performance for large applicatoins](https://www.airpair.com/angularjs/posts/angularjs-performance-large-applications). 
