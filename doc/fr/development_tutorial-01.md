## Introduction

Cet article est un tutoriel d'initiation au code source du logiciel Cesium. Celui-ci vous permettra, à travers une succession d'étapes, d'accéder à la maîtrise des outils et méthodes utilisés quotidiennement par les développeurs de Cesium pour créer et modifier le logiciel.

A la fin de ce tutoriel, vous serez donc *capable de modifier le logiciel*. Et si le cœur vous en dit, vous pourrez même réaliser une modification et partager celle-ci avec le dépôt de code principal, afin que celle-ci soit officiellement intégrée et disponible aux utilisateurs !

A vos claviers !

## Niveau I : récupérer le code source

Ce premier niveau consiste à créer *votre propre version* des sources du logiciel et de récupérer cette copie sur votre ordinateur. Vous y produirez : 

* votre propre compte *GitHub*
* votre propre version du logiciel, votre *fork*
* une copie locale des fichiers de code source provenant de votre *fork*

### Créez un compte GitHub

> Si vous disposez déjà d'un compte GitHub, vous pouvez passer cette étape.

Rendez-vous sur https://github.com (site en anglais). Renseigner les 3 champs proposés :

* Nom d'utilisateur
* E-mail
* Mot de passe

<img src="https://forum.duniter.org/uploads/default/original/1X/13ade346327b73bbf1acc97027af147eeb4e9089.png" width="346" height="325">

Vous recevrez probablement un e-mail de confirmation qu'il vous faudra valider. Une fois cette étape passée, vous devriez disposer d'un compte GitHub .

### Forkez le dépôt principal

Rendez-vous à l'adresse https://github.com/duniter/cesium. Cliquez sur le bouton « Fork » en dans le coin supérieur droit de la page :

<img src="https://forum.duniter.org/uploads/default/original/1X/3b9228c664520496d6a7e86e3f9c4c438f111914.png" width="388" height="98">

### Installer Git

L'installation de Git dépend de votre système d'exploitation. Suivez simplement les indications présentes sur : https://git-scm.com/

### Cloner votre fork

A ce stade, vous êtes en mesure de récupérer votre version du code source (votre *fork*), afin de pouvoir travailler dessus.

#### Ouvrez Git en ligne de commande

Pour récupérer le code source, lancez Git en mode console.

* Sous Linux et MacOS, ouvrez tout simplement le Terminal
* Sous Windows lancez le programme *Git Bash* :

<img src="https://forum.duniter.org/uploads/default/original/1X/6fc638dc0a22d88da7e84dbf0371e69747767f78.png" width="432" height="80">

#### Clonez votre fork, en ligne de commande

Retournez sur la page web GitHub, puis trouvez le bouton « Clone or download » : 
Cliquez dessus, vous pourrez alors copier l'URL de clonage en cliquant sur l'icône de valise.

Vous n'avez plus qu'à retourner dans votre console Git et saisir : 

    git clone <coller l'URL copiée>

ce qui donne dans mon cas : 

```
git clone https://github.com/blavenie/cesium.git
Cloning into 'cesium'...
 (...)
Checking connectivity... done.
```

Si vous êtes arrivés à un comportement similaire, **bravo**, vous posséder désormais le code source Cesium !
 
## Niveau II : Compilation et lancement dans un navigateur

Ce second niveau vise à obtenir les outils de base pour exécuter le code source, et vérifier son bon fonctionnement. Vous y réaliserez : 

* l'installation du moteur d'exécution JavaScript *Node.js*
* la vérification du bon fonctionnement du code source *via* le lancement de l'application, en mode web.

Si l'application se lance, vous aurez dores et déjà un environnement entièrement **fonctionnel** !

### Installer Node.js

#### Sous Linux / MacOS

Installer Node.js est devenu extrêmement simple pour ces OS : un outil vous permet d'installer la version de Node.js que vous souhaitez, en changer quand vous voulez et sans conflit avec une version précédente : il s'agit de [nvm](https://github.com/creationix/nvm).

Vous pouvez installer nvm avec la commande suivante :

```bash
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.31.1/install.sh | bash
```

Fermez puis rouvrez votre terminal, comme indiqué. Puis, installez Node.js (choisissez la version 5) : 

```bash
nvm install 5
```

Vous aurez alors la dernière version de la branche 5.x de Node.js prête à l'emploi.

##### Outils de compilation

Installer les outils nécessaires pour la compilation.
```bash
sudo apt-get install build-essential
```

#### Sous Windows

Pour Windows, téléchargez la version 5 disponible sur le site officiel de Node.js : https://nodejs.org

Puis lancez l'installeur ainsi téléchargé.

### Installer les modules Node.js de Cesium

Cesium repose sur des librairies tierce pour fonctionner appelées *dépendances*, comme par exemple des librairies de compilation (gulp, bower, ionic).

Le fait d'avoir cloné les sources n'est en réalité pas suffisant pour lancer l'application. Nous devons obtenir le code des dépendances pour obtenir ainsi l'ensemble du code exécutable du programme. Pour ce faire, retournez dans la console Git et déplacez-vous dans le répertoire cloné : 

```bash
cd cesium
```

Puis, lancez le téléchargement et l'installation des modules Cesium à l'aide de la commande : 

```bash
npm install -g bower gulp ionic cordova
```
Puis pour les dépendances non globales :
```bash
npm install
```

> Le processus d'installation peut prendre plusieurs minutes. En effet, il faut télécharger toutes les dépendances de Cesium et même en compiler certaines.

Si tout s'est bien passé, vous devriez obtenir une fin d'arborescence dans la console, et l'invité de commande devrait vous avoir rendu la main : 

```bash
├── bower@1.7.9 
├─┬ gulp@3.9.1 
│ ├── archy@1.0.0 
│ ├─┬ chalk@1.1.3 
 (...)
│ ├─┬ through2@0.5.1 
│ │ ├── readable-stream@1.0.34 
│ │ └── xtend@3.0.0 
│ └─┬ vinyl@0.2.3 
│   └── clone-stats@0.0.1 
└── shelljs@0.3.0 


npm WARN cesium@0.0.1 No repository field.
npm WARN cesium@0.0.1 No license field.

blavenie@~$
```

> Il se peut que vous obteniez des messages `npm WARN [...]`. Rien de grave : comme le nom du message l'indique, il s'agit simplement d'un avertissement non bloquant pour la suite des événements.

Puis installer les dépendences via bower :
```bash
bower install
```

### Installer un IDE

Pour développer sous NodeJS, vous pouvez utiliser l'IDE de votre choix :

 * Par exemple Sublime Text (non libre) : https://www.sublimetext.com/
 * Autre possibilité : WebStorm (non libre mais fonctionnement très avancé). cf Post de cgeek sur le développement de Duniter.

### Installer Chrome et/ou Firefox

Pour débugger plus facilement le javascript Cesium, il est plus facile Les navigateur Chrome

## Niveau III : maîtriser les commandes usuelles

Ce troisième niveau permet de découvrir les quelques (cinq) commandes que vous utiliserez tout le temps si vous développez Cesium. Vous y apprendrez : 

* à configurer Cesium, notamment le noeud Duniter qu'il utilisera (par défaut);
* à le lancer Cesium dans votre navigateur;

### Configurer Cesium

La configuration par défaut de notre environnement est visible dans le fichier : app/config.json

```bash
{
          "default": {
            "APP_CONFIG": {
              "DUNITER_NODE": "cgeek.fr:9330",
              "NEW_ISSUE_LINK": "https://github.com/duniter/cesium/issues/new?labels=bug",
              "TIMEOUT": 4000,
              "DEBUG": false,
              "NATIVE_TRANSITION": false
            }      
          },
          "duniter-fr": {
            "APP_CONFIG": {
              "DUNITER_NODE": "cgeek.fr:9330",
              "NEW_ISSUE_LINK": "https://github.com/duniter/cesium/issues/new?labels=bug",
              "TIMEOUT": 4000,
              "DEBUG": false,
              "NATIVE_TRANSITION": false
            }       
          },
         (...)
        "dev": {
            "APP_CONFIG": {
              "DUNITER_NODE": "localhost:9201",
              "TIMEOUT": 4000,
              "DEBUG": false,
              "NATIVE_TRANSITION": true
            }
          }
}
```

Nous utiliserons la configuration "dev", pour utiliser votre noeud Duniter.
Pour activer cette configuration, lancez la commande :

```bash
 gulp default --env dev
```

```bash
[17:32:34] Using gulpfile ~/git/duniter/cesium/gulpfile.js
[17:32:34] Starting 'sass'...
[17:32:34] Starting 'config'...
[17:32:34] Building `www/js/config.js` for `dev` environment...
[17:32:34] Finished 'config' after 71 ms
[17:32:36] Finished 'sass' after 1.2 s
[17:32:36] Starting 'default'...
[17:32:36] Finished 'default' after 10 μs
```

Cesium est maintenant configuré pour utiliser votre noeud Duniter local.

### Lancer Cesium (mode web)

Moment fatidique ! Il ne vous reste plus qu'à lancer l'application (en mode web) pour savoir si tout s'est bien passé et que vous êtes prêts pour la suite.
Lancez la commande suivante : 

```bash
ionic serve
```

Une fois terminée, la commande affiche : 

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
Vous pouvez ouvrir un navigateur web à l'adresse suivante : http://localhost:8100 
Vous verrez la page d'accueil de Cesium.

### Documentation

Cesium utilise le framework Ionic, qui a une bonne documentation : http://ionicframework.com.

Consulter ce site pour en savoir plus.

## Niveau IV : Se repérer dans le code 

### Répérer les couches logicielles

Ouvrir votre IDE, et ouvrir le projet Cesium.

Chercher et répérer dans le code : 

* les templates HTML qui porte les IHM : www/templates
* les controllers (JS)  : www/js/controllers
* les services (JS)  : www/js/services

### Aller plus loin dans le code

Cesium s'appuie sur AngularJS. D'excellentes documentations sont présentes sur le web.

__Note :__ La version d'AngularJS utilisée est une 1.x : la 2.x change complètement l'approche du code... La suite nous dira si Cesium passera à la version 2.

## Niveau V : Debuggage

### Sous Chrome

Ouvrir l'application dans Chrome à l'adresse http://localhost:8100

Ouvrir la console de développeur : "Option > Plus d'outils > Outils de développement"

Dans l'explorateur de fichier javascript : 
 
 * Chercher et visualisé le fichier "js/controllers/wot-controllers.js"
 * Chercher la méthode "certifyIdentity()"
 * Placer un point d'arrêt.

Dans l'application web : 

 * Dans le menu de gauche, cliquer sur "Annuaire";
 * Recherche un utilisateur;
 * Cliquer sur l'utilisateur pour visualiser son identité
 * Cliquer sur le bouton "Certifier"
 * Vérifier que la console s'arrête sur le point d'arrêt.

Pour découvrir le code, il est intéressant

## La Suite ?!

Vous pouvez maintenant poursuivre avec les niveaux qui suivent.
Nous y verrons comment modifier un écran de Cesium.

[Voir la suite ici >>](./development_tutorial-02.md)