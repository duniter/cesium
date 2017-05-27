## Introduction

Cet article est un tutoriel pour développer un plugin Cesium.

## Prérequis

Avant de faire ce tutoriel, vous devez : 
 
 - Avoir suivi les tutoriels sur Cesium [jusqu'au niveau VII](./development_tutorial-02.md)

## Niveau XIII

### Objectif

L'objectif ici est d'inésrer des fonctionnalités à Cesium, en exploitant le mécanisme de plugin.
Dans la page `Mes opérations`, nous allons ajouter un bouton pour télécharger l'historique des opérations du compte. 

### Récupérer le code (tag rml9)

Passez sur la branche du code #rml9  : https://github.com/duniter/cesium/tree/rml9


### Activation du plugin 

Editer le fichier `www/index.html`, et décommenter LES DEUX lignes : 
```html
   (...)
   <link href="dist/dist_css/plugins/graph/css/style.css" rel="stylesheet">
   (...)
   <script src="dist/dist_js/plugins/rml9/plugin.js"></script>
   (...)
```

Editer le fichier `www/js/plugins.js`, et décommenter la ligne : 
```json
   (...)
   ,'cesium.rml9.plugin'
   (...)
```

Editer le fichier `www/js/config.js`, et ajouter ces lignes : 
```json
   (...)
   "plugins": {
   		(...)
   		 // --- DEBUT des lignes à ajouter
       "rml9": {   
         "enable": true
       }
       // --- FIN des lignes à ajouter
       (...)
   	},
```

Le plugin RML9 est maintenan activer. Il ne reste plus qu'à lancer Cesium pour vérifier :
```bash
ionic serve
```

### Développement du plugin 

Dans le fichier  `www/plugins/rml9/plugins.js`, identifier la méthode `onButtonClick`. 




## La suite ?

Il ne vous reste qu'à publier le résultat ! ;) 

- sur le forum duniter,
- ou mieux via un `pull request` sur github.