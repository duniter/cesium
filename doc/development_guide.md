# Development Guide

## In a post-it

```bash
# Install NodeJS v16
nvm use 16
npm install -g yarn 

# Clone and compile from source
git clone git@git.duniter.org:clients/cesium-grp/cesium.git
cd cesium
yarn

# Run the App !
yarn run start
```


## Step by step

### Prerequisite  

To build Cesium, you will have to: 
 
1. Installing build tools:
   ```bash
      sudo apt-get install git wget curl unzip build-essential software-properties-common ruby ruby-dev ruby-ffi gcc make
   ```

2. Installing node.js v16 :

  * First, install [nvm](https://github.com/nvm-sh/nvm) (Node Version Manager) :    
    ```bash
       wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.1/install.sh | bash
    ```

    > Alternatively, if you are using `fish shell`, there is a [dedicated plugin](https://github.com/jorgebucaran/fish-nvm).

  * Then, reload your terminal (for instance by executing the command `bash`);

  * Configure nvm to use the expected version: (**WARNING**: upper version will NOT work !) 
    ```bash
       nvm install 16
    ```
      
3. Installing node build tools, as global dependencies:
   ```bash
      npm install -g yarn gulp cordova @ionic/cli@6.20.9 web-ext
   ```
   
### Get the source code and dependencies
   
1. Getting the source code:    
  ```bash
     git clone git@git.duniter.org:clients/cesium-grp/cesium.git
  ```
  
2. Install project dependencies:    
   ```bash
      cd cesium
      yarn
   ```

3. Installing Cordova plugins (required to build Android and iOS artifacts): 
   ```bash
      export JAVA_HOME=/path/to/jdk-11
      export PATH=$JAVA_HOME/bin:$PATH
      ionic cordova prepare
   ```

   This should create new directories `platforms/android` and `platforms/ios`.

   > As a reminder: check that your command line is well configured:
   > - You must place yourself in the directory of the application: `cd cesium`
   > - and working with NodeJs **v16**: `nvm use 16` (please check using the command `node --version`)
    

### Prepare configuration file

Configure Cesium default settings :
 
1. Add your environment config into `app/config.json`
   
2. Update default configuration, using the command:    
   ```bash
      gulp config --env <your_env_name> 
   ```

  This will update a configuration file `www/js/config.json`.
 
### Compile and launch

To compile and launch Cesium, run:
```bash
  yarn run start
```

or alternative: `npm start` or `ionic serve` 

The application should be running at [localhost:8100](http://localhost:8100)!


### Build artifacts 

Cesium can be build:
- [as an unhosted web applicationa](build_web.md);
- [for Android](build_android.md);
- [for iOS](build_ios.md);
- [as a Web extension](build_web_extension.md) for Mozilla Firefox or Chrome/Chomium;
- [as a Desktop application](build_desktop.md) for Linux (`.deb`), Windows and MacOSx;

You may also [use Docker image](build_docker.md) to simplify this task;   


### Time to code !

#### Pull request

For each pull request, please create an issue first.

#### Best practices for development

Cesium could be run on phone devices. Please read [performance tips on AgularJS + Ionic](http://julienrenaux.fr/2015/08/24/ultimate-angularjs-and-ionic-performance-cheat-sheet/)
before starting to contribute.

Read also [Angular performance for large applicatoins](https://www.airpair.com/angularjs/posts/angularjs-performance-large-applications). 
