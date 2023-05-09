## Presentation

This article is the 2nd initiation tutorial to the Cesium software source code.

You will be able to understand the role of the different software layers,
by modifying them in order to improve a screen of Cesium.

## Prerequisites

Before doing this tutorial, you must:
  
 - Know the functionalities of Cesium. If not, refer to [la vidéo de présentation générale des fonctionnalités](https://www.youtube.com/watch?v=FQzGIzJf9Nw&list=PLr7acQJbh5rzgkXOrCws2bELR8TNRIuv0&index=6) (RML7) and the one detailing the new features (RML8 - link to come)
 - Have followed the 1st tutorial for setting up the environment [jusqu'au niveau III](https://github.com/duniter/cesium/blob/master/doc/fr/development_tutorial.md)

## Level VI: Display a missing currency parameter

__Objective :__ In this level, the objective is to display in the [`Currency`](http://g1.duniter.fr/#/app/currency/view/lg/) page the monetary parameter `stepMax`.

> As a reminder, `stepMax` is the maximum distance between a member and an applicant, so that the latter can enter the web of trust.

### Modify the HTML template

Open the template file `/www/templates/currency/items_parameters.html`.

Add a new item in the list of parameters, i.e. a new `<ion-item>` tag, below the other tags of the same name:

```html
   (...)

   <ion-item class="item-icon-left">
     <i class="icon ion-steam"></i>
     <span translate>CURRENCY.VIEW.STEP_MAX</span>
     <span class="badge badge-stable">{{stepMax}}</span>
   </ion-item>
```

If you refresh the `Currency` page of your browser, you should see the change:

<img src="../fr/img/19a637b1fa847aa5bbb18565737e9e5e28729221.jpg" width="431" height="97">

### Internationalizing a Label

The `CURRENCY.VIEW.STEP_MAX` string actually represents an **internationalized message key**.
We now need to add the translation of this key.

> The icon is configured simply by the `ion-stream` CSS class. To find out which icons are available, see
[ionicons.com](http://ionicons.com/)

Open the file `www/i18n/locale-fr-FR.json` and identify the element `CURRENCY` then `VIEW`.
Add the translation for our new key:

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

Don't forget **to add a comma** on the preceding line...

> Note: Cesium internationalization uses the AngularJS plugin [angular-translate](https://github.com/angular-translate/angular-translate).
> Depending on the case, it is possible to use HTML tags, like here the tag `<br/>`

Refresh your browser page: the key has been translated! 

<img src="../fr/img/6bd04622dd2eb59f6d716ae9e2f114276e4ca35a.jpg" width="690" height="116">

Repeat the operation in the **other translation files** present in `www/i18n`:

```
    (...)
    "STEP_MAX": "Maximum distance between<br/>each WoT member and a newcomer"
   }  

```

### Add a dynamic variable

All that remains is to dynamically display the value of our `stepMax` parameter. We will use the `data-binding` functions that AngularJS allows.

> In AngularJS, it is a controller that manages the filling of values, typically from data obtained on the network.

Open the `CurrencyViewController` controller present in the file `www/js/controllers/currency-controllers.js`
This controller already makes a call to the Duniter API [`/blockchain/parameters`](http://cgeek.fr:9330/blockchain/parameters).

Identify the `load()` function.
Modify the return code of the `/blockchain/parameters` call, to store the `stepMax` value in the `$scope`:

```
function CurrencyViewController($scope, $q, $translate, $timeout, BMA, UIUtils, csSettings, csCurrency, csNetwork) {
  // Ajout d'une propriété qui stockera la valeur de stepMax
  // (On met ici la valeur par défaut)
  $scope.stepMax = 0;
  (...)

  $scope.load = function() {
    (...)
    
    return $q.all([

      // Get the currency parameters
      BMA.node.blockchain.parameters() 
       .then(function(json){
          $scope.currency = json.currency;
          (...)
          // Mise à jour de la valeur, à partir du résultat que renvoi le noeud Duniter
          $scope.stepMax = json.stepMax;
        }),
      (...)
```

> The '$scope' object is used to manipulate values shared between the controller and the template.
> The value we put in `$scope.stepMax` is displayed thanks to the `{{stepMax}}` instruction that you put in the HTML template.

Your browser should now display:

<img src="../fr/img/3df8cbd2133ea9e9a28855f4b50413846fdf292c.jpg" width="519" height="85">

Congratulations, you now know how to display new values in Cesium screens!

## Level VII: Publish your changes

__Objective :__  Become an official contributor, by publishing your code!

### Make a `pull request`

If you have never used git on your current machine, you will first need to define

1. your email address: `git config --global user.email "your@email.xyz"`
2. your first and last name: `git config --global user.name "First name NAME"`

The change you just made actually corresponds to [ticket #209](https://git.duniter.org/clients/cesium-grp/cesium/issues/209).
To add your modification to it, and thus **become an official contributor** of Cesium:

 * Type the command `git add` followed by the names of the files you modified or, more simply, `git add *` to add all modified files to the commit.
 * Then do a `git commit` to commit your code;
 * Finally, do a `git push` to push to your GitHub repo.
 * In GitLab, log in to your account;
 * Open your `Cesium` repository via the "Projects" > "Your projects" menu that you will find at the top left, in the navigation bar.
 * In the left menu, go to "Merge requests", and click on the "New merge request" button
 * Most of the fields are already pre-populated, so all you have to do is select the source branch (if you haven't changed your branch via the git command line, it's "master")
 * Click on `Compare branches and continue`
 * In the title the reference to the ticket: `#209`

Your contribution is now visible to Cesium developers, who will be able to integrate your code more easily.

> _Note :_ Since RML7, this ticket has been closed. You can therefore continue this level, by adding other missing variables (see next paragraph), then 
> publish your changes: the `pull request` process remains the same.

## Niveau VIII : Free modification

__Objective :__  Now it's up to you to add the missing information that seems interesting.

### Add new variables

To get your hands on the changes in Cesium, you can add other missing currency settings.
For example, among those concerning the _BlockChain_: `xpercent`, `percentRot`, `blocksRot`...

You can find their definition in the [Duniter protocol documentation](https://github.com/duniter/duniter/blob/master/doc/Protocol.md#protocol-parameters).

> _Tip:_ to separate the different parts of the screen, add a separator, i.e. a `<div>` tag with the CSS class `item item-divider`:

```html
  <div class="item item-divider">
      <span translate>CURRENCY.VIEW.BLOCKCHAIN_DIVIDER</span>
  </div>
  <!-- paramètres relatifs à la blockchain -->
```

## See more ?!

You can now continue with the following levels. We will see how to compile and deploy Cesium on Android, then how to add a plugin, and even add a dynamic graph!

[See more here >>](./development_tutorial-03-android.md)