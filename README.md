# Scan to Google Sheets — Tournée des Pastilles

PWA de scan QR pour la tournée des pastilles SST, Domtar Château-Richer.

## Architecture

- **Frontend** : [web/index.html](web/index.html) — hébergé sur GitHub Pages
- **Backend** : [apps-script/Code.gs](apps-script/Code.gs) — déployé sur Google Apps Script, écrit dans le Google Sheets « Tournée des Pastilles »

## Fonctionnement

L'opérateur ouvre l'app dans Chrome (icône sur l'écran d'accueil), scanne une pastille QR collée dans l'usine. Le contenu du QR (ex : `1- Cases Transformation (Bas escalier)`) est ajouté comme nouvelle ligne dans le Google Sheets avec horodatage et indicateur `1`.

**Mode hors ligne** : les scans sont stockés dans IndexedDB du navigateur et synchronisés automatiquement dès que la connexion revient. Aucune perte de données dans les zones de mauvaise réception de l'usine.

## Déploiement

Voir [INSTRUCTIONS.md](INSTRUCTIONS.md).
