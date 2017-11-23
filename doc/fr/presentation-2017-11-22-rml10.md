# Nouveautés

Nouveautés (depuis les RML9 du Havre).

> Version 1.0.0 sortie cette semaine !

## Vue réseau
- Compat Duniter v1.6
- Affichage des nœuds WS2P (public)
- Info du nœud connecté (mode expert uniquement)

## Connexion
- Connexion != Authentification
- Connexion par pubkey
- Connexion par fichier de trousseau

## Mon Compte
- Avertissement sur les fonctionnalités supplémentaires

## Mes opérations
- Affichage des DU créés
- Date cliquable → ouvre le block

## Ergonomique
- Mobile : rafraichissement par glisser haut → bas
- Mobile : share button use web URL

## Cesium +

### Architecture

- fallback nodes

### Vue réseau

- Avatar sur les nœuds mirroir 
- Optimisation des perfs d'affichage

### Profiles

- Localize (use OpenStreetMap)

### Invitations
- Désactivé pour les postulants 
- Cartes : réseau, membres, pages
- Gestion des « pages », avec recherche spatiale

### Documents stockés (beta)
- Statistiques sur e nombre de documents (maj toutes les heures) : [#/app/data/stats](https://g1.duniter.fr/#/app/data/stats)
- Explorateur : en cliquant sur [un graph de statisque](https://g1.duniter.fr/#/app/data/stats)
- Suivi des synchro P2P : [#/app/data/synchro](https://g1.duniter.fr/#/app/data/synchro)

### Noeud ElasticSearch (projet Duniter4j)
- [Site web de documentation](http://doc.e-is.pro/duniter4j)
- Documents: hourly stats (count by index)
- New `pages` index
- JSON documents 
  * `version : 2`
  * Signature sur le hash, et non plus sur tout le document
- P2P synchro
  * Couche réseau de Duniter

  * Configuration :
    - `duniter.p2p.discovery.enable`
    - `duniter.p2p.includes.endpoints`