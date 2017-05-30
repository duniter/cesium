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

Une fois récupérer, vous devriez voir les nouveaux fichiers suivant : 

```pre
 www
  \-- plugins
      |-- (...)    // plugins existants
      \-- rml9     // le nouveau plugin    
          |-- i18n // ici, les traductions
          |-- templates // ici, les fichiers HTML content les interfaces graphiques
          |    |-- buttons.html 
          |    \-- view.html 
          \-- plugin.js // le code du plugin (= le controlleur Angular JS, etc.)
```

> Pour simplifier, nous avons ici regrouper tout le code dans un seul fichier (`plugin.js`). Les plugins existants, plus important, ont cependant un déoupage plus fin, en plusieurs fichiers.

### Activation du plugin 

Editer le fichier `www/index.html`, et ajouter les **deux** lignes suiavntes : 
```html
   (...)
   <!-- dans la partie CSS, vers le haut du fichier -->
   <link href="dist/dist_css/plugins/graph/css/style.css" rel="stylesheet">
   (...)
   
   <!-- dans la partie JS, vers le bas du fichier -->
   <script src="dist/dist_js/plugins/rml9/plugin.js"></script>
   (...)
```

Editer le fichier `www/js/plugins.js`, et ajouter la ligne suivante : 
```js
   (...)
   // Plugins
   'cesium.graph.plugin', // Ligne déjà existante, mais n'oubliez pas la virgule à la fin ! ;)
   'cesium.rml9.plugin'   // <-- La nouvelle ligne
   (...)
```

Editer le fichier `www/js/config.js`, et ajouter les lignes : 

```js
   // (...)
   "plugins": {
       // (...)
       // Activation du plugin RML9
       "rml9": {
         "enable": true
       }  
       // (...)
   },
```

### Vérification de l'activation du plugin

Le plugin `rml9` est maintenant activé. Il ne vous reste plus qu'à lancer Cesium pour vérifier !

```bash
cd cesium
ionic serve
```

Ouvrez Cesium dans un navigateur, à l'adresse [localhost:8100](http://localhost:8100) 

Allez dans `Annuaire`, puis choisissez une personne. Vous devriez voir un nouveau bouton, vert : 
 
<img src="/uploads/default/original/2X/4/4e28c8487f380ac6229a735e01ac206d13fd9a21.png" width="690" height="225">

Le nouveau plugin est opérationnel !

> Pour le moment, ce plugin ne fait rien d'utile, mais nous allons pouvoir l'enrichir tranquillement. ;)


## Niveau XIII : Etendre l'interface graphique

__Objectif :__ Grâce à ce niveau, vous allez savoir étendre un écran existant de Cesium.  

### Se repérer dans le code

Ouvrez le fichier  `www/plugins/rml9/plugins.js`. Dans le partie, haute, identifier la partie qui permet la définition du point d'insertion du plugin `rml9` : 

```js
    var enable = csConfig.plugins && csConfig.plugins.rml9;
    if (enable) {

      // Extension de la vue d'une identité
      PluginServiceProvider
        .extendState('app.wot_identity', {
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

Vous y voyez qu'une page (appelée `state` dans AngularJS) est étendue : la page d'une identité, dont state est `app.wot_identity`

> Le nom de cette page (`state`) provient du code de Cesium du fichier `www/js/controllers/wot-controllers.js`.

Dans le code du plugin, notons aussi qu'un point d'extension utilisé est nommé. Il s'agit de l'emplacement où notre code sera injecté dans Cesium. Ici, le point d'extension est nommé `buttons` : 
```js
          points: {
            'buttons': {  // <- nom du point d'extension, où va s'insérer notre plugin
              // ...
```

Ce point d'extension a été défini dans le template HTML de la page affichant une identité : le fichier `www/templates/wot/view_identity.html`. Le formalisme utilisé pour le définir est très simple : 
```html
   <!-- Définition d'un point d'extension nommé "buttons", dans le template de la page à étendre -->
   <cs-extension-point name="buttons"></cs-extension-point>
```

Ouvrez maintenant le fichier `www/plugins/rml9/templates/buttons.html` : 

```html
  <!-- Button: export -->
  <button class="button button-balanced button-small-padding icon ion-android-archive"
          ng-click="onExportButtonClick()"
          title="{{'RML9.BTN_EXPORT' | translate}}">
  </button>
```

Ce fichier contient le contenu visuel de notre plugin. Ici, simplement le bouton ajouté à l'écran par notre plugin...

Simple comme un `Hello world`, non ? ;)


### Ajout du bouton dans une autre page

Vous allez maintenant ajouter le bouton de notre plugin (ce même bouton qui ne fait rien !) dans une autre page bien connue : `Mes opérations`.

Editer le fichier  `www/plugins/rml9/plugins.js`. Puis, sous la première extension définie, ajouter les lignes suivantes : 

```js
       
     // Extension de 'Mes opérations'
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
> Cet état est visible en ouvrant le fichier `www/js/controllers/wallet-controllers.js` (dans la partie haute du fichier).
 
> __Attention :__ Bien que le nom du point d'extension soit encore `buttons`, il s'agit _d'un autre point d'extension_, distinct, et défini cette fois dans un template : `www/templates/wallet/view_wallet_tx.html`

Vérifier maintenant que le résultat est celui attendu : 
 - Ouvrez Cesium, puis connectez-vous (à n'importe quel compte)
 - Dans la page `Mes opérations`; notre même bouton vert vient d'apparaitre !

<img src="/uploads/default/original/2X/e/e02307b86cf43dc7c6dcc4f8a77b797e50b45d82.png" width="518" height="196">

### Etendre, n'importe où !

Maintenant que vous comprenez comment étendre Cesium, vous comprenez aussi qu'on peut étendre n'importe quelle partie de l'interface de Cesium !

La méthologie est toujours la même :

 - Chercher dans les `templates` HTML, la page (ou le composant) que vous voulez étendre;
 - S'il n'y en a pas déjà, à l'emplacement qui vous inéteresse, ajouter dans ce template, à l'emplacement précis de votre choix, un nouveau point d'extension. Vous devrez lui choisir un nom. Par exemple : 
```html
   <cs-extension-point name="this-is-a-good-extension-place"></cs-extension-point>
```
 - Dans les controlleurs de Cesium, chercher le nom de la page (state) concernée;
 - Dans le code du plugin, étendre le point d'extension de la manière suivante  : 
```js      
     PluginServiceProvider
       .extendState('app.a_state_name', {          // ici, le nom de la page (=state), à identifier dans les controlleurs
          points: {
            'this-is-a-good-extension-place': {    // ici, le nom du point d'extension concerné
              templateUrl: "plugins/rml9/templates/buttons.html",
              controller: 'Rml9ButtonsCtrl'
            }
          }
        });
```



Editer le fichier `www/plugins/rml9/templates/buttons.html`


Dans le fichier  `www/plugins/rml9/plugins.js`, identifier la méthode `onButtonClick`. 


## Niveau XIII : Développer un export de fichier

__Objectif :__ Ce niveau a pour objectif de développer un fonctionnalité d'export des comptes, en fichier.  

### Se repérer dans le code

Dans le fichier  `www/plugins/rml9/plugins.js`, identifier la méthode `onButtonClick`. 


## Niveau XIII

__Objectif :__ L'objectif est d'enrichir le plugin, en y ajoutant un nouvel écran (ou `view`). 
Cette écran permettra l'affichage de transactions d'un compte (quelconque, et pas seulement le votre). 

### Ajout d'une vue (`view`)



### Ajout d'un bouton d'accès


## La suite ?

Vous pouvez maintenant poursuivre avec les niveaux qui suivent. Nous y verrons comment **ajouter un graphique**.

[Voir la suite ici >>](./development_tutorial-05-add_chart.md)


