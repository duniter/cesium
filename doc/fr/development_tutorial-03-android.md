## Introduction

Cet article est un tutoriel pour développer sur Cesium, pour compiler et tester l'application sous Android.

## Prérequis

Avant de faire ce tutoriel, vous devez : 

 - Avoir suivi les tutoriels sur Cesium [jusqu'au niveau VII](./development_tutorial-02.md)

## Niveau IX

### Objectif

L'objectif ici est d'installer les outils de base pour compiler et vérifier son bon fonctionnement sous Android. Vous y réaliserez : </p>

- l'installation du `JDK`
- l'installation du logiciel `Android Studio`
- l'installation de l'émulateur `KVM`
- l'installation du `NDK Android` (optionnel - sera nécessaire plus tard)

### Installation des logiciels

#### Installer JDK

Le JDK ou _Java Development Kit_ 

Vous pouvez la télécharger sur le site [d'Oracle](http://www.oracle.com/technetwork/java/javase/downloads/jdk8-downloads-2133151.html).

<img src="./img/fef4f4dfe7c2168cb27c9e7f5e399fd547ce774a.png" width="400">

En fonction de votre système d'exploitation, téléchargez correspondant.

Installez ensuite le fichier normalement, en suivant les étapes guidées.

#### Installer Android Studio

Vous trouverez tous les fichiers à l'adresse [AndroidStudio-Downloads](https://developer.android.com/studio/index.html#downloads)

Pour Windows télécharger le fichier sans SDK Android:

<img src="./img/3b8fa2f5c0465b13ae5ce74d49702e0c9f027866.png" width="690" height="237">

##### Sous Linux

Il vous suffit de décompresser le fichier ZIP, d'ouvrir un terminal dans ce dossier et de taper la commande:
```bash
./bin/studio.sh
```

##### Sous Windows et Mac OS

Installez l'exécutable que vous avez précédemment téléchargé.

##### Toutes machines confondues

A la fin de l'installation ou au premier lancement, Android Studio vous indiquera que vous ne possédez pas de SDK et vous proposera de l'installer :

- Si vous l'avez déjà installé vous pouvez indiqué où il se trouve.
- Sinon installez la version qu'il vous propose.


#### Installer NDK (optionnel)

> Le NDK est utilisé pour l'exécution de code sous C++, notamment la librairie de cryptographie NaCL.
> Cette étape est pour le moment optionnelle (pour les experts seulement).

Vous pouvez le télécharger à l'adresse : [ce site](https://developer.android.com/ndk/downloads/index.html)

Attention : n'installez pas la version 12 du NDK. Elle n'est pas encore stable.

Encore une fois téléchargé la bonne version, décompressez le fichier à coté de votre SDK.

Sous Android Studio allez dans le menu `File > Project Structure...`

<img src="./img/04e64b769cbd45b9d275cd5f81002a399a1a7684.png" width="300">

Une fenêtre comme celle-ci devrait s'ouvrir : 

<img src="./img/ceb75301172038e75f5c43b328dd7febd7bedc7e.png" width="450">

Renseignez le chemin d'installation du NDK.

#### Installer l'émulateur KVM (optionnel)

Pour Linux / Debian uniquement :

```bash
sudo apt-get install kvm qemu-kvm libvirt-bin bridge-utils virt-manager
sudo groupadd libvirtd
sudo adduser `id -un` libvirtd
```

##### En cas de problème...

If you get this error :
```
Cannot run program "/home/eis/android-sdks/build-tools/21.1.2/aapt": error=2, Aucun fichier ou dossier de ce type
```

Installez deux librairies de compatibilité supplémentaires (solution provenant de [ce post](http://stackoverflow.com/questions/22701405/aapt-ioexception-error-2-no-such-file-or-directory-why-cant-i-build-my-grad)) :                            
```bash
sudo apt-get install lib32stdc++6 lib32z1
```


## Niveau X: Lancement de l'application sous Android Studio

### Configuration du projet

Placez-vous dans le dossier dans lequel vous avez installé cesium via la commande `cd` suivie du chemin vers le répertoire idoine.

Vérifiez que vous utilisez bien la version de NodeJs dont Cesium a besoin à l'aide de la commande  

```
node --version
```

Si vous n'êtes pas sur une v6, utilisez la commande 

```
nvm use 6
```

Vous pouvez maintenant lancer l'instalaltion du projet Cesium pour Android :


```
ionic state restore
```

Normalement, cette commande devrait initialiser (entre autre) un répertoire `platforms/android`.

> Cette commande peut prendre un moment à se terminer.

Lancez maintenant la compilation pour Android :

```
ionic build android
```

Lancez maintenant Android Studio. Vous devriez arriver sur cette fenêtre:

<img src="./img/33266d44fdbfd6c8b44e46a3664edafacaf0a316.png" width="500">

Sélectionnez "Open an existing Android Studio project" et indiquez le dossier vers `cesium/platforms/android`.

### Lancer l'application

Pour pouvoir lancer un émulateur, on va devoir en créer un.

Pour cela, allez dans `Tools` > `AVD Manager`, ou cliquez sur l'icone suivante :

<img src="./img/46e959d1e616e34972a41f4d120a1d4f5beb0955.png" width="690" height="42">

Une fenêtre va s'ouvrir et vous proposer de créer un "Virtual Device" suivez le logiciel.

Si vous avez un téléphone Android vous pouvez le mettre en mode développeur et le brancher si vous souhaitez voir l'application sur votre téléphone.

Puis, une fois l'émulateur créé, vous pouvez cliquer le bouton "Play" (<img src="./img/70b2ce88a5e7aa5754f6a771cf5efed3c639a27b.png" width="46" height="44">) pour lancer l'application.
Vous pouvez aussi utiliser l'icone (<img src="./img/b7c419b33a43f6a43c5b756074ee0c199072f7d1.png" width="40" height="44">) pour lancer l'application en mode debug.

Android Studio vous demandera sur quel appareil vous souhaitez lancer l'application, sélectionner l'émulateur ou le téléphone et laissez faire. 


## Niveau XI: Lancement de l'application par `ionic`

Vous pouvez maintenant utiliser directement l'outil `ionic` : 

 - Soit pour lancer votre application sur une téléphone connecté :
  ```bash
  ionic run android
  ```

 - Soit pour la lancer sur une émulateur :
  ```bash
  ionic emulate android
  ```

## La Suite ?!

Vous pouvez maintenant poursuivre avec les niveaux qui suivent. Nous y verrons comment ajouter un plugin à Cesium.

[Voir la suite ici >>](./development_tutorial-04-add_plugin.md)