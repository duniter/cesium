# Development Guide

## Prerequisite  

To build Cesium, you will have to: 
 
  - Installing build tools:
```
 sudo apt-get install build-essential
```

  - Installing [nvm](https://github.com/creationix/nvm)
```
  wget -qO- https://raw.githubusercontent.com/creationix/nvm/v0.34.0/install.sh | bash
```

> Then reload your terminal, for instance by executing the commande `bash`

  - Configure NodeJS to use a version 6: (**WARNING**: upper version will NOT work !) 
```
  nvm install 6
```
      
  - Installing node.js build tools:
```
   npm install -g gulp bower cordova @ionic/v1-toolkit@2.0.18
```
   
## Get the source code and dependencies
   
  - Getting source and installing project dependencies:    
```
  git clone git@git.duniter.org:clients/cesium-grp/cesium.git
  cd cesium
  npm install
```

  - Installing Cordova plugins (need for platforms specific builds)   
```
  ionic state restore
  ionic browser add crosswalk@12.41.296.5
```

- This should create a new directory `platforms/android`

> To remind: check that your command line is configured:
> - You must place yourself in the directory of the application: `cd cesium`
> - and be configured for NodeJs v6: `nvm use 6` (please check using the command `node --version`)


## Prepare environment, then compile and launch

 - To configure your build environment :
 
    * Add your environment config into `app/config.json`
   
    * Update default configuration, using the command:
    
```
  gulp config --env <your_env_name> 
```

> This will update the configuration file used by cesium, at `www/js/config.json`.
 
  - Compiling and running Cesium:
```
  npm start
```
 
> or alternative: `ionic serve` 

  - Open a web browser at address: [localhost:8100](http://localhost:8100). The application should be running.
  
## Best practices for development

 Cesium could be run on phone devices. Please read [performance tips on AgularJS + Ionic ](http://julienrenaux.fr/2015/08/24/ultimate-angularjs-and-ionic-performance-cheat-sheet/)
 before starting to contribute.
 Read also [Angular performance for large applicatoins](https://www.airpair.com/angularjs/posts/angularjs-performance-large-applications). 
