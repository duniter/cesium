## Introduction

This article is an introductory tutorial to the source code of the Cesium software. 

This will allow you, through a succession of steps, to access the mastery of the tools and methods used daily by the developers of Cesium to create and modify the software.

At the end of this tutorial, you will be *able to modify the software*. And if you feel like it, you can even make a change and share it with the main code repository, so that it is officially integrated and available to users!

To your keyboards!

## Level I: Retrieve the source code

This first level consists of creating *your own version* of the software sources and retrieving this copy on your computer. You will produce:

* your own account on the [GitLab de Duniter](https://git.duniter.org)
* your own version of the software, your *fork*
* a local copy of the source code files from your *fork*

### Create a GitLab Duniter account

> If you already have a GitLab account, you can skip this step.

Go to [https://git.duniter.org](https://git.duniter.org/users/sign_in?redirect_to_referer=yes) (site in english).

In 'Register' Fill in the 3 proposed fields:

* Full name 
* Username 
* E-mail 
* Password

You will probably receive a confirmation email that you will need to validate. Once this step is over, you should have an account on the GitLab Duniter.

### Fork the main repo

Go to https://git.duniter.org/clients/cesium-grp/cesium.

Click the "Fork" button at the top of the page (below the logo).

### Install Git

Installing Git depends on your operating system. Simply follow the instructions on : https://git-scm.com/

### Clone your fork

At this point, you are able to retrieve your version of the source code (your *fork*), so that you can work on it.

#### Open Git from the command line

To retrieve the source code, launch Git in console mode.

* On Linux and MacOS, simply open Terminal
* On Windows launch the *Git Bash* program :

<img src="../fr/img/6fc638dc0a22d88da7e84dbf0371e69747767f78.png" width="432" height="80">

#### Clone your fork from the command line

Go back to the GitHub webpage and find the "Clone or download" button: Click on it, you can then copy the clone URL by clicking on the suitcase icon.

All you have to do is go back to your Git console and enter: 

    git clone <paste the copied URL>

which gives **in my case**:

```
git clone git@git.duniter.org:blavenie/cesium.git
Cloning into 'cesium'...
 (...)
Checking connectivity... done.
```

If you have come to a similar behavior, **great**, you now have the Cesium source code!
 
## Level II: Compiling and Launching in a Browser

This second level aims to obtain the basic tools to execute the source code, and verify its proper functioning. You will realize:

* installation of the JavaScript runtime *Node.js*
* the verification of the proper functioning of the source code *via* the launch of the application, in web mode.

If the application launches, you will already have a fully **functional** environment!

### Install Node.js

#### Under Linux / MacOS

Installing Node.js has become extremely simple for these OS: a tool allows you to install the version of Node.js you want, change it whenever you want and without conflict with a previous version: it is [nvm](https://github.com/creationix/nvm).

You can install nvm with the following command:

```bash
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.6/install.sh | bash
```

Close and reopen your terminal, as shown. Then, install Node.js (choose version 12):

```bash
nvm install 12
```

You will then have the latest version of node's 5.x branch.js ready to use.

##### Compilation tools

Install the necessary tools for compilation.
```bash
sudo apt-get install build-essential
```

(mac users https://appuals.com/how-to-fix-sudo-apt-get-command-not-found-on-macos/)

#### On Windows

For Windows, download version 6 available from the official website of Node.js: https://nodejs.org

Then launch the installer thus downloaded.

### Install Cesium Node.js modules

Cesium relies on third-party libraries to run called *dependencies*, such as compilation libraries (gulp, ionic, angularJS).

The fact that you cloned the sources is actually not enough to launch the application. We need to get the code of the dependencies to get all the executable code of the program. To do this, go back to the Git console and move to the cloned directory:

```bash
cd cesium
```

Then, start downloading and installing the Cesium modules using the command:

```bash
npm install -g yarn gulp cordova@10.0.0 @ionic/cli web-ext
```

Then for non-global dependencies:

```bash
yarn
```

> The installation process may take several minutes. Indeed, it is necessary to download all the dependencies of Cesium and even compile some of them.

If everything went well, you should get an end tree in the console, and the command prompt should have returned your hand:

```bash
yarn install v1.15.2
[1/4] Resolving packages...
  (...)
$ node -e "try { require('fs').symlinkSync(require('path').resolve('node_modules/@bower_components'), 'www/lib', 'junction') } catch (e) { }"
Done in 0.82s.
```

> You may get `npm WARN messages [...] `. Nothing serious: as the name of the message suggests, it is simply a non-blocking warning for the rest of the events.

Then install the remaining dependencies (via bower):

```bash
npm run postinstall
```

### Install an IDE

To develop in NodeJS, you can use the IDE of your choice:

 * For example Sublime Text (not free) : https://www.sublimetext.com/
 * Other possibilities : 
    * VS Code (free).
    * WebStorm (not free but very advanced operation).

### Install Chrome and/or Firefox

To debug Cesium javascript more easily, it is easier to use the Chrome browser

## Level III: Mastering the usual commands

This third level allows you to discover the few (five) commands that you will use all the time if you develop Cesium. You will learn:

* configure Cesium, including the Duniter node it will use (default);
* to launch Cesium in your browser;

### Configure Cesium

The default configuration of our environment is visible in the file 'app/config.json'. Several profiles are present: 'default', 'dev', etc.

```json
{
   "default": {
       "cacheTimeMs": 60000,
       "fallbackLanguage": "en",
       "rememberMe": false,
       "showUDHistory": false,
       "timeout": 10000,
       "timeWarningExpireMembership": 5184000,
       "timeWarningExpire": 7776000,
       "useLocalStorage": true,
       "useRelative": true,
       "initPhase": false,
       "expertMode": false,
       "decimalCount": 4,
       "helptip": {
         "enable": true,
         "installDocUrl": "https://github.com/duniter/duniter/blob/master/doc/install-a-node.md"
       },
       "node": {
         "host": "g1.duniter.org",
         "port": "443"
       },
       "plugins":{
         "es": {
           "enable": true,
           "askEnable": false,
           "host": "g1.data.duniter.fr",
           "port": "443"
         }
       }
     },
     
     (...)
     "dev": {
         "cacheTimeMs": 60000,
         "fallbackLanguage": "fr-FR",
         "defaultLanguage": "fr-FR",
         "rememberMe": true,
         "showUDHistory": false,
         "timeout": 6000,
         "timeWarningExpireMembership": 5184000,
         "timeWarningExpire": 7776000,
         "useLocalStorage": true,
         "useRelative": true,
         "initPhase": false,
         "expertMode": false,
         "decimalCount": 2,
         "helptip": {
           "enable": true,
         },
         "node": {
           "host": "localhost",
           "port": "9600"
         },
         "plugins":{
           "es": {
             "enable": false
           }
         }
       },
}
```

We will use the "dev" configuration, you  may use your Duniter node.

Change the 'host' and 'port' values of the 'dev' configuration profile to match your Duniter node:

```json
  "dev: {
  ...
         "node": {
           "host": "localhost",
           "port": "9600"
         },
  ...
```

Disable the plugin "es" (used for Cesium+) :

```json
  "dev: {
  ...
         "plugins":{
           "es": {
             "enable": false
           }
         }
  ...
```

To enable this configuration, now run the command:

```bash
 gulp config --env dev
```

```bash
[17:32:34] Using gulpfile (...)/cesium/gulpfile.js
[17:32:34] Starting 'config'...
[17:32:34] Building `www/js/config.js` for `dev` environment...
[17:32:36] Finished 'config' after 10 μs
```

> This command will be restarted at the time of your changes to the `app/config` file.

Cesium is now configured to use your local Duniter node.

### Launch Cesium (web mode)

All you have to do is launch the application (in web mode) to find out if everything went well and that you are ready for the future.

Run the following command :

```bash
npm start
```

 > Alternative : `ionic serve`

When complete, the command displays :

```bash
Running live reload server: http://localhost:35729
Watching: 0=www/**/*, 1=!www/lib/**/*
Running dev server:  http://localhost:8100
Ionic server commands, enter:
  restart or r to restart the client app from the root
  goto or g and a url to have the app navigate to the given url
  consolelogs or c to enable/disable console log output
  serverlogs or s to enable/disable server log output
  quit or q to shutdown the server and exit

ionic $ 
```

You can open a web browser at http://localhost:8100
You should see the Cesium homepage there.
 
Congratulations, you have an operational Cesium installation!

### Documentation

Cesium uses the Ionic framework, which has good documentation : http://ionicframework.com.

Visit this site to learn more.

## Level IV: Finding your way around the code

### Locate software layers

Open your IDE, and open the Cesium project.

Search and locate in the code:

* HTML templates that carry HMIs: www/templates 
* controllers (JS): www/js/controllers 
* services (JS): www/js/services

<img src="../fr/img/a5078db3abdf71c87f245e948ce94a181b0e0f37.png" width="690" height="369">


### Go further in the code

Cesium relies on AngularJS. Excellent documentation is available on the web.

__Note :__ The version of AngularJS used is a 1.x. The 2.x and above change completely and impose a complete redesign... This redesign is planned by 2019, in a version 2 of Cesium.

## Level V: Debugging

### On Chrome

#### Open The Source Explorer

Open the app in Chrome at http://localhost:8100

Open the developer tools: 
* Menu `Option > More Tools > Developer Tools` 
* or by the keyboard shortcuts: `Ctrl + Shift + i`

#### Debug a user's certification

Open the source explorer, and then locate the file `dist/dist_js/app/controllers/wot-controllers.js`.

Find the method `$scope.certify()`, and place a breakpoint there.

Navigate the Cesium app as follows:

 * Click in the menu (on the left) `Annuaire`;
 * Searches for a user and then visualizes their identity;
 * In `Certification received`, click on the `Certify` button;
 * Verify that the console stops at the breakpoint.

<img src="../fr/img/eca671a6d24b8e11566cfcca11b65e6c9c9c370c.png" width="690" height="223">

Discover the code by scrolling down the step-by-step action.

> Use the keys from `F9` to `F11`, to enter a method (F11), advance step by step (F10) or to the next breakpoint (F9), etc.


## See more ?!

You can now continue with the following levels. We will see how to modify a Cesium screen.

[See more here >>](./development_tutorial-02.md)
