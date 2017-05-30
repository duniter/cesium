## Introduction

Cet article est un tutoriel pour développer sur Cesium+, en utilisant les capacités de l'ES API portée par Duniter4j.

## Prérequis

Avant de faire ce tutoriel, vous devez : 
 
 - Avoir suivi les tutoriels sur Cesium [jusqu'au niveau VII](./development_tutorial-02.md)
 - Avoir suivi le tutoriel sur Duniter4j [jusqu'au niveau V](https://github.com/duniter/duniter4j/blob/master/doc/fr/development_tutorial.md).

## Niveau XII

### Objectif

L'objectif ici est de réaliser un graphique représentant la répartition des émétteurs de paiement à destination d'un compte.

: http://g1.duniter.fr/#/app/currency/view/lg/  

### Récupérer le code (tag rml8)

Passez sur la branche du code #rml8  : https://github.com/duniter/cesium/tree/rml8


### Ajout de librairie dans Cesium

#### librairie Chart.js

[Chart.js](chartjs.org) est une librairie JS qui permet de faire de magnifiques graphiques.

Vérifier que cette librairie est installé dans Cesium, en ouvrant la page principale de l'application  `www/index.html` et en repérant la ligne :
```html
<script src="js/vendor/Chart.js"></script>
```

Si ce n'est pas le cas, ajouté là avec la commande :
```
bower install chartjs --save
```

Puis ajouter la librairie dans `www/index.html`.  

#### librairie Angular Chart

[Angular Chart](https://jtblin.github.io/angular-chart.js/) est une librairie qui intègre pleinement `Chart.js` dans Angular JS, utilisé par Cesium.
Cela permet de définir plus facilement un graphique. 

### Gestion du controlleur 

Editer le fichier `www/js/controllers.js`, et décommenter la ligne : 
```json
   (...)
   'cesium.currency-charts.controllers',
   (...)
```

Editez le fichier `www/js/controllers/currency-charts-controllers.js`.

A vous de jouer ! Il faut : 

- Remplir la requete POST vers le noeud ES sur l'index `/g1/block/_search`; cf méthode `$scope.loadUds()';
- Traiter le retour de la requête, pour la transformer dans le format attendu par D3.js.

### Template

Editez le template HTML.

Regardez la documentation Chart.js pour savoir comment faire la suite !

### Testez !

#### Démarrer le noeud ElasticSearch 

Démarrer votre noeud ES :  

```bash
cd duniter4j
mvn install -DskipTests
mvn install -Prun -pl duniter4j-es-assembly 
```

#### Démarrer Cesium

Lancer Cesium : 

```bash
cd cesium
ionic serve
```

## La suite ?

Si vous avez réussi ce niveau, vous êtes vraiment un contributeur expert de Cesium !

Il ne vous reste qu'à publier le résultat ! ;) 

- sur le forum duniter,
- ou mieux via un `pull request` sur github.