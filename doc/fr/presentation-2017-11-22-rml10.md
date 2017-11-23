# Nouveautés

Nouveautés (depuis les RML9 du Havre).

> ACTU ! **Version 1.0.0** sortie cette semaine !

## Cesium standard

### Architecture
- Nœuds de données de secours (fallback nodes)
  * Configuration via `/config.js`

### Connexion
- Connexion != Authentification
- Connexion par pubkey
- Connexion par fichier de trousseau

### Vue réseau
- Compat Duniter v1.6
- Affichage des nœuds WS2P (public)
- Info du nœud connecté (mode expert uniquement)

### Annuaire
- Nombre de résultats (membres, inscription en attente, etc.)

### Mon Compte
- Info sur les fonctionnalités supplémentaires

### Mes opérations
- Affichage des DU créés
- Date cliquable → ouvre le block

### Ergonomique
- Mobile : 
  * Rafraichissement par glissé "haut → bas"
  * Bouton "Partager/Share" utilise les adresses web
  * Gestion de bouton "Retour/Back"

### API de paiement

- Accessible via [/api](https://g1.duniter.fr/api)
- Redirection vers la page appellante
- Génération d'un bouton HTML

## Cesium+ (extension optionnelle)

### Architecture

- Nœuds de données de secours (fallback nodes)
  * Configuration via `/config.js`
- Visite guidée (fonctionne à nouveau !) 

### Vue réseau

- Avatar sur les nœuds mirroir 
- Optimisation des perfs d'affichage
- [Cartes des nœuds](https://g1.duniter.fr/#/app/network/map)
  * localisation des IP via [freegeoip.net](http://freegeoip.net)

### Annuaire > Toile de conficance
 
- [Carte des profiles](https://g1.duniter.fr/#/app/wot/map) (membres, inscriptions en attente, simples portefeuilles)
- Fonction de recherche
- Visite guidée
 
### Annuaire > Pages 

- Page = Identification d'un simple portefeuille
- Type de page : association, entreprise (dont commerce local), institution
- Clef associée != Clef du rédacteur de la page
- [Carte des pages](https://g1.duniter.fr/#/app/wot/pagemap) : séparée des profiles

### Profiles

- Localisation 
  * Cocher la case : `Apparaitre sur les cartes Cesium ?`
  * Résolution de l'adresse via un web service OpenStreetMap
  * Nécessaire pour apparaitre dans la carte (sans utiliser des services privateurs)

### Invitations
- Désactivé pour les postulants 
- Cartes : réseau, membres, pages
- Gestion des « pages », avec recherche spatiale

### Services en ligne
- Notifications par email : plus dans les SPAM ! :)

### Documents stockés (beta)
- Statistiques sur e nombre de documents (maj toutes les heures) : [#/app/data/stats](https://g1.duniter.fr/#/app/data/stats)
- Explorateur : en cliquant sur [un graph de statistique](https://g1.duniter.fr/#/app/data/stats)
- Suivi des synchro P2P : [#/app/data/synchro](https://g1.duniter.fr/#/app/data/synchro)


## Noeud ElasticSearch (ES)

Géré dans le projet [Duniter4j](https://github.com/duniter/duniter4j)

> Version 1.0 sortie cette semaine !

### Architecture

- Meilleure stabilité !
- Nouveau format des documents (JSON)
  * `version : 2`
  * Signature sur le `hash`, et non plus sur tout le doc (plus rapide)
- Meilleure gestion du `time`
  * Nouveaux controles : refus des dates futures ou trop vielles, etc.
  
### Synchro P2P 
- Utilise la couche réseau de Duniter
  * Via `endpoints` avec API : `ES_CORE_API`, `ES_USER_API` ou `ES_USER_SUBSCRIPTION`
- Récupération des données :
  * par API HTTP
  * et/ou par WebSocket (quasi temps réel)
- Configuration :
  * `duniter.p2p.discovery.enable`
  * `duniter.p2p.includes.endpoints`
    
Notes :
- Plusieurs nœuds synchronisés, en production !
- Marqueurs `lu` ou `non lu`: lié à chaque noeud ES
    
### Nouveaux index

- [docstat/record](https://g1.data.duniter.fr/docstat/record/_search?pretty) : Statistiques sur le nombre de docs
  * maj toutes les heures
- [docstat/record](https://g1.data.duniter.fr/page/record/_search?pretty) : Pages

### Documentation

- [Site de documentation technique](http://doc.e-is.pro/duniter4j)
