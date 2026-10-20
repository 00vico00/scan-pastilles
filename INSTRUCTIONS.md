# Tournée des Pastilles — Guide

## Pour les opérateurs

### URL de l'app

```
https://00vico00.github.io/scan-pastilles/
```

### Installer sur le téléphone (à faire une seule fois)

1. Ouvrir **Chrome** sur le téléphone Android
2. Aller à l'URL ci-dessus
3. Au premier lancement, **accepter l'accès à la caméra**
4. Menu Chrome (⋮) → **Ajouter à l'écran d'accueil** → confirmer
5. Une icône « Tournée des Pastilles » apparaît sur l'écran d'accueil

### Utilisation

- Toucher l'icône pour ouvrir l'app (s'ouvre en plein écran, comme une vraie app)
- Pointer la caméra sur une pastille QR → vibration + bip = scan capturé
- Après chaque scan, un écran de confirmation montre :
  - Le nom du point scanné
  - **« Enregistré »** (en ligne) ou **« Sauvegardé · sera envoyé au retour du signal »** (hors ligne)
  - La liste des pastilles encore à scanner
- Toucher **« Scanner la prochaine »** pour reprendre la caméra
- En haut à droite, bouton **« ≡ Liste »** pour consulter la liste complète en tout temps
- Dans la vue Liste, bouton **« Recommencer la tournée »** pour repartir à zéro

### Mode hors ligne

Si le téléphone perd le signal (zones mortes de l'usine) :
- Le scan continue de fonctionner normalement
- L'écran de confirmation indique « Sauvegardé · sera envoyé au retour du signal »
- Une pastille orange « X en attente » s'affiche en haut
- **Aucune perte** : les scans restent dans le téléphone
- Dès que le signal revient (ou en rouvrant l'app au bureau), tout se synchronise automatiquement vers le Google Sheets

---

## Pour l'administrateur (Nicholas)

### Architecture

| Composant | Rôle | Hébergement |
|---|---|---|
| **Frontend** (PWA scan) | App de scan dans le navigateur | GitHub Pages — repo public [00vico00/scan-pastilles](https://github.com/00vico00/scan-pastilles), dossier `docs/` |
| **Backend** (`Code.gs`) | Endpoint POST qui ajoute les lignes au Sheets (verrou `LockService` : les écritures simultanées de deux téléphones sont sérialisées). Un GET sur l'URL redirige vers l'app GitHub Pages | Google Apps Script attaché au Sheets de la tournée |
| **Données** | Historique des scans (date, point, 1) | Google Sheets dans le Drive du compte `sechoirpfrcr@gmail.com` |

Le frontend envoie un POST cross-origin vers l'URL Apps Script avec un secret partagé. Le backend valide le secret et écrit les lignes.

### URL et identifiants

- **App opérateur** : `https://00vico00.github.io/scan-pastilles/`
- **Backend Apps Script** : `https://script.google.com/macros/s/AKfycbz9arlNh79x5taFzUYcEIWVlAsGLQkoEtPfvJ0shukdnAnR64AKfMGJLpqb4R1kCltK/exec`
- **Compte Google opérateur** : `sechoirpfrcr@gmail.com`
- **Script ID Apps Script** : `1iQcSjED_6d8DWEudJCJMN2HebjkUgSbiL8GPR-HEDU2RYK4S5l0rEKir`
- **Secret partagé** : `tournee-pastilles-chr-2026` (présent dans `apps-script/Code.gs` et `docs/index.html`)

### Modifier l'app (workflow de mise à jour)

#### Pour le frontend (HTML/CSS/JS de l'app)

1. Éditer `docs/index.html`
2. Commit + push sur la branche `main` du repo GitHub :
   ```bash
   cd "C:/Users/nicho/ProjetsClaude/Scan to Google Sheets"
   git add docs/index.html
   git commit -m "Description du changement"
   git push
   ```
3. GitHub Pages rebuild automatiquement en ~30 sec
4. Les téléphones des opérateurs verront la nouvelle version à la prochaine ouverture (cache HTTP de 10 min max)

#### Pour le backend (Code.gs Apps Script)

1. Éditer `apps-script/Code.gs`
2. Push vers Apps Script via clasp :
   ```bash
   cd "C:/Users/nicho/ProjetsClaude/Scan to Google Sheets"
   npx clasp push
   npx clasp deploy --deploymentId AKfycbz9arlNh79x5taFzUYcEIWVlAsGLQkoEtPfvJ0shukdnAnR64AKfMGJLpqb4R1kCltK
   ```
3. Le redéploiement garde la **même URL** — les téléphones ne voient aucune différence

### Rapport quotidien de tournée (courriel)

Chaque matin vers 6 h 30, `rapportTournee()` (déclencheur horaire Apps Script) envoie un courriel depuis `sechoirpfrcr@gmail.com` avec le verdict des quarts écoulés :

- **Nuit (18 h → 6 h)** : évaluée toutes les nuits.
- **Jour (6 h → 18 h)** : évaluée pour samedi et dimanche (usine fermée) — les rapports du dimanche et du lundi matin couvrent donc deux fenêtres.
- Un quart est **COMPLET** si chacun des 19 points a été scanné au moins une fois dans sa fenêtre (ordre et regroupements sans importance). Les points manquants sont listés.
- Marge de 60 min avant le début nominal d'une fenêtre (`MARGE_DEBUT_MIN`) : une tournée commencée un peu avant le quart compte pour ce quart.
- Le courriel part **tous les jours**, complet ou non : l'absence de courriel est elle-même un signal de panne.

**Destinataires** : Script Property `RAPPORT_DESTINATAIRES` (adresses séparées par des virgules), dans l'éditeur Apps Script → Paramètres du projet → Propriétés du script. Jamais d'adresse dans le code : le dépôt est public.

**Mise en service (une fois, connecté au compte `sechoirpfrcr`)** :
1. Ouvrir l'éditeur Apps Script du Sheets « Tournée des Pastilles ».
2. Paramètres du projet → Propriétés du script → ajouter `RAPPORT_DESTINATAIRES`.
3. Exécuter `apercuRapport` (prévisualisation dans le journal, aucun envoi) — accorder les autorisations demandées.
4. Exécuter `rapportTournee` (envoi réel de test aux destinataires configurés).
5. Exécuter `installerDeclencheur` (crée le déclencheur quotidien ~6 h 30 ; le relancer remplace l'ancien sans doublon).

⚠ Le déclencheur exécute le code **HEAD** : un `npx clasp push` change le rapport immédiatement, sans `clasp deploy`. Le endpoint POST, lui, reste sur la version déployée. Si un `clasp deploy` suit un ajout de nouvelles autorisations (courriel, déclencheurs), faire d'abord la mise en service ci-dessus (l'autorisation dans l'éditeur), sinon la nouvelle version du web app peut se retrouver non autorisée.

**Dépannage du rapport** :

| Problème | Solution |
|---|---|
| Aucun courriel reçu | Éditeur Apps Script → Exécutions : voir si `rapportTournee` a tourné et son erreur · Déclencheurs : vérifier qu'il existe · Script Property `RAPPORT_DESTINATAIRES` présente ? |
| Changer les destinataires | Modifier la Script Property, rien à redéployer |
| Faux « incomplet » le matin | Le téléphone n'avait pas synchronisé à 6 h 30 (scans en attente) — le Sheets fait foi après coup |
| Tournée à cheval sur 18 h ou 6 h | Marge de 60 min déjà appliquée au début de fenêtre ; ajuster `MARGE_DEBUT_MIN` au besoin |

### Liste des pastilles attendues (constante `TOURNEE_POINTS`)

Codée en dur dans `docs/index.html`. Pour ajouter/retirer une pastille, modifier le tableau JavaScript (cherche `const TOURNEE_POINTS`), commit, push.

### Dépannage

| Problème | Solution |
|---|---|
| « Impossible d'accéder à la caméra » | Vérifier la permission Chrome pour `00vico00.github.io` dans Paramètres → Site Settings |
| Scans pas dans le Sheets | Vérifier que le Wi-Fi/cellulaire fonctionne · vérifier que l'URL Apps Script répond (curl test) · vérifier que le secret partagé matche entre frontend et backend |
| QR jamais détecté | Nettoyer la pastille · plus de lumière · approcher/éloigner le téléphone |
| Pastille toujours « hors liste » | Le texte du QR ne matche pas exactement un nom dans `TOURNEE_POINTS` (souvent une apostrophe droite `'` vs courbe `'`) — éditer la constante pour matcher le QR réel |
| Doublons rapides dans le Sheets | Augmenter `MULTI_FRAME_WINDOW_MS` dans `docs/index.html` (actuellement 1500 ms) |
| Lignes suspectes dans le Sheets (pas venues d'une tournée) | Quelqu'un a trouvé le secret partagé (il est forcément public : repo + code source de la page). Changer le secret dans `apps-script/Code.gs` **et** `docs/index.html`, puis redéployer les deux (workflows ci-dessus) |
| Sync qui répond `busy` | Normal si deux téléphones synchronisent au même instant (verrou 30 s côté backend). Les scans restent en attente sur le téléphone et repartent au prochain essai — rien à faire |
