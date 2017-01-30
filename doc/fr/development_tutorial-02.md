## Présentation

Cet article est le 2ème tutoriel d'initiation au code source du logiciel Cesium.

Vous allez pouvoir comprendre le rôle des différentes couches logicielles,
en les modifiant afin d'améliorer un écran de Cesium.

## Prérequis

### Connaitre les fonctionnalités

Il nécessite que vous connaissiez déjà l'outil Cesium.
Si ce n'est pas le cas, reportez vous à [la vidéo de présentation générale des fonctionnalités](https://www.youtube.com/watch?v=FQzGIzJf9Nw&list=PLr7acQJbh5rzgkXOrCws2bELR8TNRIuv0&index=6) (RML7) et à celle détaillant les nouveautés (RML8 - lien à venir)

### Avoir atteint le niveau III : Mise en place de l'environnement

Pour mettre en place votre environnement de développement, suivez le [1er tutoriel de mise en place de l'environnement](https://github.com/duniter/cesium/blob/master/doc/fr/development_tutorial.md) (au moins jusqu'au niveau III)

## Niveau VI : Afficher un paramètre monétaire manquant

__Objectif :__ Dans ce niveau, l'objectif est d'afficher dans la page [`Monnaie`](http://cesium.duniter.fr/#/app/currency/view/lg/) le paramètre monétaire `stepMax`.

> Pour rappel, `stepMax` est la distance maximale entre un membre et un postulant, pour que ce dernier puisse rentrer dans la toile de confiance.

### Modifier le template HTML

Ouvrez le fichier de template `/www/templates/currency/tabs/items_parameters.html`.

Ajouter un nouvel élément dans la liste des paramètres, c'est à dire un nouveau tag `<ion-item>`, sous le tag `<ion-list>` : 

```html
   (...)

   <ion-item class="item-icon-left">
     <i class="icon ion-steam"></i>
     <span translate>CURRENCY.VIEW.STEP_MAX</span>
     <span class="badge badge-stable">{{stepMax}}</span>
   </ion-item>
```

Si vous rafraichissez la page `Monnaie` de votre navigateur, vous devriez observer la modification :

<img src="https://forum.duniter.org/uploads/default/original/2X/1/19a637b1fa847aa5bbb18565737e9e5e28729221.jpg" width="431" height="97">

### Internationliser un libellé

La chaine `CURRENCY.VIEW.STEP_MAX` représente en réalité une **clef de message internationalisé**.
Il nous faut maintenant ajouter la traduction de cette clef.

> L'icone est configurée simplement par la classe CSS `ion-stream`. Pour connaitre les icones disponble, consultez  
le site [ionicons.com](http://ionicons.com/)

Ouvrez le fichier `www/i18n/locale-fr-FR.json` et identifiez l'élément `CURRENCY` puis `VIEW`.
Ajouter la traduction pour notre nouvelle clef :

```json
  "CURRENCY": {
   (...)

  "VIEW": {
    "TITLE": "Monnaie",
    (...)
    "SIG_WINDOW": "Maximum delay a certification can wait<br/>before being expired for non-writing.",
    "STEP_MAX": "Distance maximale dans la toile de confiance<br/>entre chaque membre et un nouvel entrant"
  }
}
```

N'oubliez pas **d'ajouter une virgule** sur la ligne qui précéde...

> Note : l'internationalisation de Cesium utilise le plugin AngularJS [angular-translate](https://github.com/angular-translate/angular-translate).
> Suivant les cas, il est possible d'utiliser des tags HTML, comme ici le tag `<br/>`

Refarichissez la page de votre navigateur : la clef a bien été traduite ! 

<img src="https://forum.duniter.org/uploads/default/original/2X/6/6bd04622dd2eb59f6d716ae9e2f114276e4ca35a.jpg" width="690" height="116">

Recommencez l'opération dans les **autres fichiers de traduction** présents dans `www/i18n` : 

```
    (...)
    "STEP_MAX": "Maximum distance between<br/>each WoT member and a newcomer"
   }  

```

### Ajouter d'une variable dynamique

Il ne reste plus qu'à afficher dynamiquement la valeur de notre paramètre `stepMax`. Nous utiliserons les fonctions de `data-binding` que permet AngularJS.

> Dans AngularJS, c'est un controlleur qui gère le remplissage des valeurs, typiquement à partir de données obtenues sur le réseau.

Ouvrez le controlleur `CurrencyViewController` présent dans le fichier `www/js/controllers/currency-controllers.js`
Ce controlleur fait déjà un appel à l'API Duniter [`/blockchain/parameters`](http://cgeek.fr:9330/blockchain/parameters).

Identifiez la fonction `loadParameters()`.
Modifiez le code de retour de l'appel `/blockchain/parameters`, pour stocker la valeur `stepMax` dans le `$scope` : 

```
function CurrencyViewController($scope, $q, $translate, $timeout, BMA, UIUtils, csSettings, csCurrency, csNetwork) {
  // Ajout d'une propriété qui stockera la valeur de stepMax
  // (On met ici la valeur par défaut)
  $scope.stepMax = 0;
  (...)

  $scope.loadParameter = function() {
    if (!$scope.node) {
      return;
    }
    var M;
    return $q.all([

    // Appel de /blockchain/parameters sur le noeud Duniter
        $scope.node.blockchain.parameters() 
         .then(function(json){
            $scope.currency = json.currency;
            (...)
            // Mise à jour dela valeur, à partir du résultat que renvoi le noeud Duniter
            $scope.stepMax = json.stepMax;
          }),
          (...)
```

> L'objet '$scope' sert à manipuler des valeurs partagées entre le controlleur et le template.
> La valeur que nous avons mise dans `$scope.stepMax` est affichée grâce à l'instruction `{{stepMax}}` que vous avez mise dans le template HTML.

Votre navigateur doit maintenant afficher : 

<img src="https://forum.duniter.org/uploads/default/original/2X/3/3df8cbd2133ea9e9a28855f4b50413846fdf292c.jpg" width="519" height="85">

Bravo, vous savez maintenant afficher de nouvelle valeurs dans les écrans de Cesium !

### Devenir contributeur officiel > faire `pull request`

La modification que vous venez de faire correspond en réalité au [ticket gihub #209](https://github.com/duniter/cesium/issues/209).
Pour lui adjoindre votre modification, et ainsi **devenir officiellement contributeur** de Cesium : 

 * Faites un `git commit` pour valider votre code;
 * Puis un `git push` pour envoyer sur votre repo GitHub.
 * Dans github, connectez sur votre compte;
 * Ouvrez votre dépot `Cesium`
 * Cliquer sur `New pull request`, en indiquant dans le titre la référence au ticket : `#209`

Votre contribution est maintenant visible par les développeurs de Cesium, qui pourront plus facilement intégrer votre code.

### Pour aller plus loin : d'autres variables ?  (optionnel)

Pour vous faire la main sur les modifications dans Cesium, vous pouvez ajouter d'autres paramètres manquants de la monnaie, notamment ceux qui concernent la Blockchain  : `xpercent`, `percentRot`, `blocksRot`...

Vous trouverez leur définition dans la [documentation du protocole Duniter](https://github.com/duniter/duniter/blob/master/doc/Protocol.md#protocol-parameters).

Astuce : pour séparer les différentes partie de l'écran, ajoutez un séparateur, c'est à dire un tag `<div>` avec la classe CSS `item item-divider` :

```html
  <div class="item item-divider">
      <span translate>CURRENCY.VIEW.BLOCKCHAIN_DIVIDER</span>
  </div>
  <!-- paramètres relatifs à la blockchain -->
```

Autre modification que vous pouvez faire : la correction de la formule du DU (cf [ce ticket](https://github.com/duniter/cesium/issues/210)).

## La Suite ?!

Vous pouvez maintenant poursuivre avec les niveaux qui suivent. Nous y verrons comment compiler et déployer Cesium sur Android, puis comment ajouter des graphiques dynamiques.

[Voir la suite ici >>](./development_tutorial-03.md)