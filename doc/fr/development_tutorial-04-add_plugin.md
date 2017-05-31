ATTENTION : ne pas lire AVANT les RML9 (en cours de rédaction !)

## Introduction

Cet article est un tutoriel pour développer un plugin Cesium.

## Prérequis

Avant de faire ce tutoriel, vous devez : 
 
 - Avoir suivi les deux premiers tutoriels sur Cesium :
   * [Niveaux I à V](./development_tutorial-01.md) : mise en place de l'environnement, etc.
   * [Niveaux VI à VII](./development_tutorial-02.md) : modifier un écran et publier vos modifications.

## Niveau XII

__Objectif :__ Ce niveau a pour objectif d'activer un nouveau plugin, minimaliste, nommé `rml9`.  

### Récupérer le code (tag rml9)

Passez sur la branche du code #rml9  : https://github.com/duniter/cesium/tree/rml9

Une fois la branche récupérée, vous devriez voir les _nouveaux_ fichiers suivant : 

```java
 www
  \-- plugins
      |-- (...)    // plugins existants
      \-- rml9     // le nouveau plugin    
          |-- i18n // ici, les traductions
          |-- templates // ici, les fichiers HTML content les interfaces graphiques
          |    |-- button.html 
          |    \-- view.html 
          |-- plugin.js // Code final du plugin (à garder pour la fin !)
          |-- plugin-01-add_button.js  // 1ère étape du tuto
          \-- plugin-02-(...).js // etc.
```

> Pour simplifier, nous avons regroupé tout le code dans un seul fichier `plugin.js`. Dans les autres plugins, généralement, on a préfèré déoupé le code en plusieurs fichiers (controllers, services, etc).

### Activation du plugin (en version `01`)

Nous allons activer une 1ère version du plugin.

Editer le fichier `www/index.html`, et ajouter la ligne suivante, vers la fin du fichier : 
```html
   <!--removeIf(no-plugin)-->
     (...)

   <!-- Ajout du fichier JS du plugin (à mettre vers le bas de la section <head>) -->
   <script src="dist/dist_js/plugins/rml9/plugin-01-add_button.js"></script>

     (...)
   <!--endRemoveIf(no-plugin)-->
```

Editer le fichier `www/js/plugins.js`, et ajoutez une entrée dans la liste, comme indiqué ci-dessous : 
```
   (...)
   // Plugins
   'cesium.graph.plugin', // Ligne déjà existante, mais n'oubliez pas la virgule à la fin ! ;)
   'cesium.rml9.plugin'   // <-- La nouvelle ligne
   (...)
```

Editer le fichier `www/js/config.js`, et ajouter les lignes suivantes dans sous la balise `plugins` : 

```JSON
   // (...)
   "plugins": {
       // (...)
       // Activation du plugin RML9
       "rml9": {
         "enable": true
       }  
   },
```

### Vérification de l'activation du plugin

Le plugin `rml9` est maintenant activé. Il ne vous reste plus qu'à lancer Cesium pour vérifier !

```bash
cd cesium
ionic serve
```

 - Ouvrez un navigateur à l'adresse [http://localhost:8100](http://localhost:8100) 
 - Dans le menu de gauche, cliquez sur  `Annuaire`
 - puis choisissez un compte au hasard.
 - Vous devriez voir un nouveau bouton, de couleur verte :  
<img src="https://forum.duniter.org/uploads/default/original/2X/4/4e28c8487f380ac6229a735e01ac206d13fd9a21.png" width="690" height="225">

 - Ouvrez la console Javascript de votre navigateur;
 - Si vous cliquez sur le bouton vert, vous devriez voir le log suivant dans la console :
<img src="https://forum.duniter.org/uploads/default/original/2X/d/db5575c48fe0cd136a8949e5336e26ced95e08ec.png" width="676" height="77">

Bravo ! Le nouveau plugin est opérationnel !

> Pour le moment, ce plugin ne fait rien d'utile, mais nous allons pouvoir l'enrichir tranquillement : patience ! ;)

## Niveau XIII : Etendre l'interface graphique

__Objectif :__ Grâce à ce niveau, vous allez savoir étendre un écran existant de Cesium.  

### Se repérer dans le code

Ouvrez le fichier  `www/plugins/rml9/plugin-01-add_button.js`, qui contient le code du plugin.

En haut du fichier, identifiez la partie qui définit le point d'insertion du plugin, dans l'écran : 

```javascript
    var enable = csConfig.plugins && csConfig.plugins.rml9;
    if (enable) {

      // Extension de la vue d'une identité: ajout d'un bouton
      PluginServiceProvider
        .extendState('app.wot_identity', {
          points: {
            'buttons': {
              templateUrl: "plugins/rml9/templates/button.html",
              controller: 'Rml9ButtonsCtrl'
            }
          }
        });
   }
```

Vous y voyez qu'une page (ou `state` dans AngularJS) est étendue : celle d'une identité dont `state` vaut `app.wot_identity`

> L'identifant de cette page (son `state`) provient du code existant de Cesium, dans le fichier `www/js/controllers/wot-controllers.js` . Vous pouvez l'ouvrir pour mieux comprendre...

Dans le code de notre plugin, notons aussi qu'un point d'extension est nommé. Il s'agit de l'emplacement où notre code sera injecté dans Cesium. Ici, le point d'extension est nommé `buttons` : 
```
          points: {
            'buttons': {  // <- nom du point d'extension, où va s'insérer notre plugin
              // ...
```

Ce point d'extension a été défini dans le template HTML de la page affichant une identité.
Ouvrez le fichier `www/templates/wot/view_identity.html` :

```html
   <!-- Définition d'un point d'extension nommé "buttons", dans le template de la page à étendre -->
   <cs-extension-point name="buttons"></cs-extension-point>
```
Vous voyez que le formalisme utilisé pour le définir l'emplacement d'un point d'extension est très simple.

Ouvrez maintenant le fichier `www/plugins/rml9/templates/buttons.html` : 

```html
  <!-- Button: export -->
  <button class="button button-balanced button-small-padding icon ion-android-archive"
          ng-click="onExportButtonClick()"
          title="{{'RML9.BTN_EXPORT' | translate}}">
  </button>
```

Ce fichier contient le **contenu visuel de notre plugin**.
Ici, il s'agit simplement d'un bouton, avec l'appel d'une fonction à chaque clic.


Simple comme un `Hello world`, non ? ;)


### Ajouter du bouton dans une autre page

Vous allez maintenant pouvoir ajouter le bouton (le même, celui de notre plugin) dans une autre page : celle accessible par le memnu de gauche : `Mes opérations`.

Editer le fichier  `www/plugins/rml9/plugin-01-add_button.js`. Puis, sous la première extension définie, ajouter les lignes suivantes : 

```
       
     // Extension de la page 'Mes opérations': insertion du même bouton
     PluginServiceProvider
       .extendState('app.view_wallet_tx', {
          points: {
            'buttons': {
              templateUrl: "plugins/rml9/templates/buttons.html",
              controller: 'Rml9ButtonsCtrl'
            }
          }
        });

        // ...
   }
```

> La page `Mes opérations` a été étendue à partir du nom de son état (`state`) `app.view_wallet_tx`.
> Cet état est visible en ouvrant le fichier `www/js/controllers/wallet-controllers.js` (dans la partie haute du fichier). Ouvrez le si besoin, pour mieux comprendre.
 
> __Attention :__ Bien que le nom du point d'extension soit encore nommé `buttons`, il s'agit _d'un autre point d'extension_, distinct du premier, et défini dans un autre template : le fichier `www/templates/wallet/view_wallet_tx.html`

Vérifier maintenant que le résultat est celui attendu : 

 - Ouvrez Cesium, puis connectez-vous (à n'importe quel compte)
 - Dans la page `Mes opérations`; notre même bouton vert vient d'apparaitre :
<img src="https://forum.duniter.org/uploads/default/original/2X/e/e02307b86cf43dc7c6dcc4f8a77b797e50b45d82.png" width="518" height="196">

### Etendre, n'importe où ! Récapitulons...

Maintenant que vous comprenez comment étendre Cesium, vous comprenez aussi qu'on peut étendre n'importe quelle partie de l'interface de Cesium !

La méthologie est toujours la même :

 - Chercher dans les `templates` HTML, la page (ou le composant) que vous voulez étendre;
 - S'il n'y en a pas déjà, à l'emplacement qui vous inéteresse, ajouter dans ce template (à l'emplacement précis de votre choix) le nouveau point d'extension. Vous devrez lui choisir un nom, unique dans la page. Par exemple : 
```html
   <cs-extension-point name="this-is-a-good-extension-place"></cs-extension-point>
```
 - Dans le code des controlleurs (fichiers du répertoire `www/js/controllers`) recherchez le nom de la page (state) concernée;
 - Dans le code du plugin, étendre le point d'extension de la manière suivante  : 
```javascript      
     PluginServiceProvider
       .extendState('app.a_state_name', {          // ici, le nom de la page (state), à identifier dans les controlleurs
          points: {
            'this-is-a-good-extension-place': {    // ici, le nom du point d'extension concerné
              templateUrl: "plugins/rml9/templates/buttons.html",
              controller: 'Rml9ButtonsCtrl'
            }
          }
        });
```

##Niveau XIV : Ajouter une page

__Objectif :__ Ce niveau a pour objectif de vous apprendre à ajouter une nouvelle page dans Cesium. il s'agira ensuite utilise run service d'accès aux données pour afficher les transactions d'un compte.

### Activation du plugin (en version `02`)

Editez le fichier `www/index.html` pour activer cette fois le plugin en version 2 : 
 ```
     <script src="dist/dist_js/plugins/rml9/plugin-02-add_view.js"></script>
  ```

Dans votre navigateur, vérifiez que le bouton est toujours présent (page d'une identité ou `Mes opérations`).

Cliquez sur le bouton. Une nouvelle page s'ouvre alors : 
<img src="https://forum.duniter.org/uploads/default/original/2X/5/5a8b4eb0c09d8125b1d6f92551256377a700e128.png" width="690" height="299">

### Se repérer dans le code

Ouvrez le code du plugin.
En haut u fichier, repérez le code suivant : 

```
      // [NEW] Ajout d'une nouvelle page #/app/rml9
      $stateProvider
        .state('app.rml9', {
          url: "/rml9/:pubkey",
          views: {
            'menuContent': {
              templateUrl: "plugins/rml9/templates/view.html",
              controller: 'Rml9ViewCtrl'
            }
          }
        });
```

Cette déclaration ajoute une nouvelle page (state) `app.rml9`, utilisant le template HTML `view.html` et un nouveau controlleur associé.

Le code du controlleur de cette page est sité un peu plus bas : 
```
  // Manage events from the page #/app/rml9
  .controller('Rml9ViewCtrl', function($scope) {
    'ngInject';

    // When opening the view
    $scope.$on('$ionicView.enter', function(e, state) {
      console.log("[RML9] Opening the view...");

      // Get the pubkey (from URL params) and store it in the page context ($scope)
      $scope.pubkey = (state && state.stateParams && state.stateParams.pubkey);
      if (!$scope.pubkey) return;

      // Create some data to display
      $scope.items = [
        {amount: 64,   time: 1493391431, pubkey:'2RFPQGxYraKTFKKBXgp...'},
        {amount: -500, time: 1493373164, pubkey:'2RFPQGxYraKTFKKBXgp...'},
        {amount: 100,  time: 1493363131, pubkey:'5U2xuAUEPFeUQ4zpns6...'}
      ];
    });
  });
```

> Le reste du code provient du plugin réalisé lors du niveau précédent.
> Le nouveau code est identifié par des commentaire précédé de la balise "`[NEW]`"

Ouvrez maintenant le fichier `www/plugins/rml9/templates/view.html` qui contient le template HTML.
Observez notamment l'affichage des données que nous avons stockées dans la variable `$scope.items` :

```html
      <!-- Iterate on each TX -->
  <div class="item" ng-repeat="item in items">
    <h3>{{item.time|formatDate}}</h3>
    <h4>{{item.pubkey|formatPubkey}}</h4>

    <div class="badge">{{item.amount|formatAmount}}</div>
  </div>
```

> L'attribut `ng-repeat` (directive native d'Angular JS) permet de boucler simplement sur chaque élément d'une collection.

### Utiliser un service d'accès aux données

Nous allons maintenant remplacer les données "en dures" dans le code, par l'appel à un "service" existant de Cesium.

> Les "services" d'AngularJS sont des objets indépendant des interfaces, et donc réutiliables entre plusieurs écrans ou compasant graphiques. Typiquement, dans Cesium, ils executent les requêtes HTTP vers le noeud Duniter (le noeud configuré dans vos paramètres Cesium).

Dans le fichier `plugin-02-add_view.js`, remplacez l'initialisation du tableau `$scope.items` par cet appel au service `csTx` : 

```
      // Load account TX data
      csTx.load($scope.pubkey)
        .then(function(result) {
          console.log(result);  // Allow to discover data structure
          if (result && result.tx && result.tx.history) {
            $scope.items = result.tx.history;
          }
        });
```
> Le `console.log()` est un moyen simple pour découvrir la structure des données renvoyées par le service.
> Un point d'arrêt dans la fonction aura le même effet.

Notez bien le formalisme de traitement du retour de la méthode, propre aux méthodes asynchrones : 
```
  monService.maMethode()
    .then(function(result) {
      // ici, traitement du résultat
    });
```

> Pour ne pas pénaliser les performances de la navigation, les services utilisent le plus souvent une execution _asynchrone_. Il est donc indespensable de bien maitriser l'usage de telles méthodes.

#### Déclaration du service utilisé

A ce stade, si vous testez votre code.
Vous devriez avoir une erreur dans la console Javascript : 

<img src="https://forum.duniter.org/uploads/default/original/2X/a/a0d809e20b59af5786ce486dbf8c4f2ad2a0c4c8.png" width="690" height="87">

pas de panique : ce type d'erreur est fréquent ! il indique simplement que le service utilisé, `csTx`, n'a pas été déclaré comme dépendence du controlleur de la page.
Pour corriger l'erreur, ajouté le simplement dans la fonction du controlleur : 
```
  .controller('Rml9ViewCtrl', function($scope, csTx /*ICI, ajouter la décalration du service*/) {
    'ngInject';   
    // ...
```

> C'est la chaine de caratère `ngInject` qui permet de gérer automatiquement l'ajout de dépendances dans AngularJS, par injection à partir du nom. Il est donc indispensable que les variables portent ici le même nom que les services définis.

Vous pouvez maintenant tester !
<img src="https://forum.duniter.org/uploads/default/original/2X/7/7c9416bf1ee97605d1859ef0b5cc9af075555e64.png" width="690" height="470">

#### Amélioration de la page

Cette nouvelle page est correspond vraiment à une demande : celle de Galuel de pouvoir consultr un compte sans se connecter.

A vous d'imaginer comme réaliser cette fonctionnalités!

Voici simplement quelques pistes d'améliorations : 

- Calculer et afficher la balance du compte
- Ajouter le pseudo (UID) de l'utilisateur, acessible par `item.uid`
- Afficher son nom de profile et son avatar Cesium+ (`item.name` et `item.avatar`)

> Attention: dans cette dernière proposition, vous devrez penser que le plugin Cesium+ peut être désactiver, et prévoir un affichage correct (dégradé) le cas échéant ;)

#### Quels services utiliser ?

Lors du développement d'un plugin Cesium, vous devrez savoir quel service utiliser. Rassurez vous, ils sont tous regrouper dans le répertoire `www/js/services`.

Voici les plus importants : 
 
```java
  \-- www/js/services
       |-- bma-services.js   // accès complet à l'API BMA du noeud (résultats brutes)
       |-- crypto-services.js // fonctions de crypotographie
       |-- currency-services.js // nom et paramètres de la monnaie, 
       |-- device-services.js    // accès au capteurs (appareil photo, etc) - pour les téléphones/tablettes
       |-- modal-services.js    // utilitaires pour gérer les fenêtres modales simplement
       |-- network-services.js  // accès aux peers - utilisé par la page  Réseau
       |-- settings-services.js // accès aux paramètres de l'utilisateur
       |-- tx-services.js          // accès à l'historique des transaction et aux sources d'un compte
       |-- utils-services.js      // fonctions utiliaraires, comme les popup d'erreur ou de confirmation
       |-- wallet-services.js    // Le portefeuille de l'utilisateur connecté (envoi de paiement, etc.)
       \-- wot-services.js      // accès aux données de la WoT - utilisé par la page 'Annuaire' et sous-pages
```

## Niveau XV : Développer un export fichier d'un compte

__Objectif :__ Ce niveau a pour objectif de développer un fonctionnalité d'export des transactions d'un comptes, dans un fichier.

La encore, il s'agit d'une demande réelle (cf ticket #[445](#https://github.com/duniter/cesium/issues/445)).

### Activation du plugin (en version `03`)

Editez le fichier `www/index.html` pour activer cette fois le plugin en version 3 : 
 ```
     <script src="dist/dist_js/plugins/rml9/plugin-03-file_export.js"></script>
  ```

Notre page RML9 a maintenant un bouton de téléchargement : 
<img src="https://forum.duniter.org/uploads/default/original/2X/3/32f330d76431c16c56d865cb4629558c13c16410.png" width="690" height="384">

Si vous cliquez sur le bouton, un fichier (au contenu presque vide) est téléchargé.

### Utilisation d'un plugin AngularJS

Cette fois-ci, nous allons utiliser un plugin AngularJS.
La communauté AngularJS est très active : de nombreux plugins, de tous genres, sont disponibles !

Généralement, installer un nouveau plugin AngularJS est très simple. Il suffit d'executer la commande suivante pour que le téléchargement de la librairie soit fait : 
 
```bash
 > bower install <nom_du_plugin_AngularJS>
```

Le chemin de la librairie installée doit ensuite être ajouté à la main, dans le fichier `www/index.html` : 

```html
<script src="lib/ionic/js/angular/angular-file-saver.bundle.js"></script>
```

### Hop : 5 min de dev !

Allez, une petite fonction facile à coder : le remplissage du fichier d'export ! ;)

Editez maintenant le plugin (en version `03`) et modifier la méthode `onExportButtonClick()` :

```
    // [NEW] Manage click on the export button
    $scope.onExportButtonClick = function() {
      console.debug("[RML9] call method onExportButtonClick() on pubkey: " + $scope.pubkey);

     // [NEW] Load account TX data
      var fromTime = -1; // all TX (full history)
      csTx.load($scope.pubkey, fromTime)
        .then(function(result) {
          if (!result || !result.tx || !result.tx.history) return; // no TX: stop here

          // TODO: replace this !
          // You can choose any format (CSV, TXT, JSON, ...) and test it !
          var content = [
            "Hello Libre World !\n",
            "Cesium rock's !\n"
          ];

          var file = new Blob(content, {type: 'text/plain; charset=utf-8'});
          var filename = $scope.pubkey+'-history.txt';
          FileSaver.saveAs(file, filename);
        });

    };
```

Il suffit de remplir le tableau nommé `content` :)


## Niveau XVI : Etendre un service

__Objectif :__ Nous allons voir comment étendre le fonctionnement du code présent dans les services.
 

### Activation du plugin (en version `04`)






## La suite ?

Vous pouvez maintenant poursuivre avec les niveaux qui suivent. Nous y verrons comment **ajouter un graphique**.

[Voir la suite ici >>](./development_tutorial-05-add_chart.md)