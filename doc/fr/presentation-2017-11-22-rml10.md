# Nouveautés

Nouveautés (depuis les RML9 du Havre).

## Vue réseau : 
- Compat Duniter v1.6 (WS2P public)

## Connexion
- Connexion != Authentification
- Connexion par pubkey
- Connexion par fichier de trousseau

## Mon Compte
- Avertissement sur les fonctionnalités supplémentaires

## Mes opérations
- Affichage des DU créés
- Date cliquable → ouvre le block

## Ergonomique :
- Mobile : rafraichissement par glisser haut → bas
- Mobile : share button use web URL

## Cesium +

### Vue réseau

- Avatar sur les nœuds mirroir 
- nœuds WS2P (public)
- Optimisation des perfs d'affichage

### Profiles

- Localize (use OpenStreetMap)

### Invitations
- Désactivé pour les postulants 
- Cartes : réseau, membres, pages
- Gestion des « pages », avec recherche spatiale

### Documents stockés
- statistiques (toutes les heures)
- explorateur (beta) 

### Noeud ElasticSearch Duniter4j :
- Nouveau site web
- Documents : hourly stats (count by index)
- New `pages` index
- JSON documents 
  * `version : 2`
  * Signature sur le hash, et non plus sur tout le document
- P2P synchro
  * Couche réseau de Duniter

  * Configuration :
    - `duniter.p2p.discovery.enable`
    - `duniter.p2p.includes.endpoints`