## Introduction

Cet article est un tutoriel pour développer sur Cesium+, en utilisant les capacités de l'ES API portée par Duniter4j.

## Prérequis

Avant de faire ce tutoriel, vous devez : 
 
 - Avoir suivi les tutoriels sur Cesium [jusqu'au niveau VII](./development_tutorial-02.md)
 - Avoir suivi le tutoriel sur Duniter4j [jusqu'au niveau V](https://github.com/duniter/duniter4j/blob/master/doc/fr/development_tutorial.md).

## Niveau XII

### Objectif

L'objectif ici est de réaliser un graphique représentant l'évolution de montant du dividende universel.

Quand l'utilisateur cliquera sur le champ "dividende universel" de la page suivante : http://cesium.duniter.fr/#/app/currency/view/lg/  

### Récupérer le code (tag rml8)

Passez sur la branche du code #rml8  : https://github.com/duniter/cesium/tree/rml8

### Démarrer Cesium

Lancer Cesium : 

```bash
cd cesium
ionic serve
```
### Démarrer le noeud ElasticSearch 

Démarrer votre noeud ES :  

```bash
cd duniter4j
mvn install -DskipTests
mvn install -Prun -pl duniter4j-elasticsearch 
```

### Ajout de la librairie D3.js

D3.js est une puissante librairie JS qui permet de faire de magnifiques graphiques.

Vous pouvez utiliser `bower` pour installer la dépendance.
Puis ajouter la librairie dans la page principale de l'application : `www/index.html` 

### Gestion du controlleur 

Editer le fichier `www/js/controllers.js`, et décommenter la ligne : 
```json
   (...)
   'cesium.currency-charts.controllers',
   (...)
```

Editez le fichier `www/js/controllers/currency-charts-controllers.js`.

A vous de jouer ! Il faut : 

- Remplir la requete POST vers le noeud ES sur l'index `/test_net/block/_search`; cf méthode `$scope.loadUds()';
- Traiter le retour de la requête, pour la transformer dans le format attendu par D3.js.

### Template

Editez le template HTML, dans le fichier `www/templates/currency/charts/ud.html`

Regardez la documentation D3.js pour savoir comment faire la suite !

## La suite ?

Si vous avez réussi ce niveau, vous êtes vraiment un contributeur expert de Cesium !

Il ne vous reste qu'à publier le résultat ! ;) 

- sur le forum duniter,
- ou mieux via un `pull request` sur github.