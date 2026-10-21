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
- Juste dessous, bouton **« Lampe »** pour allumer la lampe de poche (il n'apparaît que si la caméra en a une)
- La tournée affichée suit le quart (jour 6 h → 18 h, nuit 18 h → 6 h) : elle repart à zéro d'elle-même au quart suivant
- Dans la vue Liste, bouton **« Recommencer la tournée »** pour repartir à zéro

### Mode hors ligne

Si le téléphone perd le signal (zones mortes de l'usine) :
- Le scan continue de fonctionner normalement
- L'écran de confirmation indique « Sauvegardé · sera envoyé au retour du signal »
- Une pastille orange « X en attente » s'affiche en haut
- **Aucune perte** : les scans restent dans le téléphone
- Dès que le signal revient (ou en rouvrant l'app au bureau), tout se synchronise automatiquement vers le Google Sheets
- **En fin de tournée, s'il reste des scans en attente : garder l'app ouverte là où il y a du signal** jusqu'à ce que la pastille disparaisse. App fermée, l'envoi n'est pas garanti avant sa prochaine ouverture, et le rapport du matin les compterait manquants.
- Point orange (au lieu de rouge) à côté de la pastille : le réseau marche, mais le serveur n'a pas accepté l'envoi. Les scans restent aussi en attente et repartent seuls.

---

## Pour l'administrateur (Nicholas)

### Architecture

| Composant | Rôle | Hébergement |
|---|---|---|
| **Frontend** (PWA scan) | App de scan dans le navigateur. La librairie de lecture QR (`html5-qrcode` 2.3.8, licence Apache 2.0) est hébergée avec l'app dans `docs/vendor/` | GitHub Pages — repo public [00vico00/scan-pastilles](https://github.com/00vico00/scan-pastilles), dossier `docs/` |
| **Backend** (`Code.gs`) | Endpoint POST qui ajoute les lignes au Sheets (verrou `LockService` : les écritures simultanées de deux téléphones sont sérialisées ; un lot déjà écrit et ré-envoyé est écarté). Un GET sur l'URL redirige vers l'app GitHub Pages | Google Apps Script attaché au Sheets de la tournée |
| **Données** | Feuille « Feuille 1 » (repérée par son identifiant, gid 0) : A = date du scan (horloge du téléphone), B = point, C = 1, D = reçu le (horloge du serveur, depuis le 2026-10). Onglet « Fermetures » : jours de semaine où l'usine est fermée | Google Sheets dans le Drive du compte `sechoirpfrcr@gmail.com` |

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

**Vérifier qu'Apps Script correspond au dépôt** : `npx clasp pull` puis `git diff -- apps-script`. Toute différence est une dérive. `.clasp.json` fixe `"scriptExtensions": [".gs"]` : sans ce réglage, clasp 3 tire un `Code.js` à côté de `Code.gs`, le `git diff` ne montre rien et le `push` suivant échoue (`FILE_CONFLICT`). `npx clasp list-deployments` montre la version servie par le web app.

`testWrite()` (éditeur Apps Script) écrit une ligne « TEST - À supprimer » dans le Sheets de production, puis la retire.

### Rapport quotidien de tournée (courriel)

Chaque matin vers 6 h 30, `rapportTournee()` (déclencheur horaire Apps Script) envoie un courriel depuis `sechoirpfrcr@gmail.com` avec le verdict des quarts écoulés :

- **Règle** : une tournée complète dans chaque quart où les opérations sont à l'arrêt.
- **Nuit (18 h → 6 h)** : évaluée toutes les nuits.
- **Jour (6 h → 18 h)** : évalué le samedi, le dimanche et chaque jour inscrit dans l'onglet **« Fermetures »** du Sheets (fériés, arrêts). Le rapport du lendemain matin couvre alors deux quarts.
- Un quart est **COMPLET** si chacun des 19 points a été scanné au moins une fois pendant ce quart (ordre et regroupements sans importance). Sinon : **INCOMPLÈTE** avec la liste des points manquants, ou **AUCUN SCAN**.
- **Bornes strictes à 6 h et 18 h.** Une tournée faite à la toute fin du quart peut déborder de quelques minutes. Les scans sont donc regroupés en suites : une pause de 20 min ou plus (`ECART_SUITE_MIN`), ou un point rescanné au moins 10 min plus tard (`NOUVEAU_PASSAGE_MIN`, deux tournées dos à dos), ouvre une nouvelle suite. Une suite à cheval sur 6 h ou 18 h compte **en entier** pour le quart où tombent la plupart de ses scans. Chaque scan ne compte que pour un seul quart.
- Les doublons de transport (même seconde, même point) ne sont comptés qu'une fois.
- Le courriel part **tous les jours**, complet ou non : l'absence de courriel est elle-même un signal de panne.

**Onglet « Fermetures »** : colonne A = date (une ligne par jour), colonne B = libellé facultatif (« Noël », « Arrêt d'été »…), ligne 1 = en-têtes. Inutile d'y mettre les samedis et dimanches. Un jour de semaine absent de la liste n'est pas surveillé de jour. Si l'onglet disparaît, le rapport le signale en pied de courriel. Fériés de la convention (art. 13.1.1) : Lundi de Pâques, Journée nationale des patriotes, 24 juin, 1er juillet, Fête du Travail, Action de grâces, 24-25-26-31 décembre, 1er-2 janvier. Un férié qui tombe un samedi est reporté au jour ouvrable précédent, un férié du dimanche au lundi suivant (art. 13.1.2, sauf entente) : inscrire le jour réellement chômé.

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
| Faux « incomplet » le matin | Le téléphone n'avait pas synchronisé à 6 h 30 (scans en attente) — le Sheets fait foi après coup. La colonne D (reçu le) dit quand chaque scan est arrivé |
| Tournée à cheval sur 18 h ou 6 h | Comptée en entier pour le quart majoritaire (voir la règle ci-dessus) ; ajuster `ECART_SUITE_MIN` ou `NOUVEAU_PASSAGE_MIN` au besoin, **et les constantes jumelles de `docs/index.html`** |
| Férié ou arrêt non évalué de jour | Ajouter la date dans l'onglet « Fermetures » ; rien à redéployer |

### Liste des pastilles attendues (constante `TOURNEE_POINTS`)

Codée en dur à **deux endroits qui doivent rester identiques** : `TOURNEE_POINTS` dans `docs/index.html` (l'app) et `POINTS_ATTENDUS` dans `apps-script/Code.gs` (le rapport). Le texte des QR fait foi. Pour ajouter ou retirer une pastille : modifier les deux, pousser le backend (`npx clasp push` suffit pour le rapport), puis l'app (commit, push).

### Dépannage

| Problème | Solution |
|---|---|
| « Impossible d'accéder à la caméra » | Vérifier la permission Chrome pour `00vico00.github.io` dans Paramètres → Site Settings |
| Scans pas dans le Sheets | Vérifier que le Wi-Fi/cellulaire fonctionne · vérifier que l'URL Apps Script répond (curl test) · vérifier que le secret partagé matche entre frontend et backend |
| QR jamais détecté | Nettoyer la pastille · plus de lumière · approcher/éloigner le téléphone |
| Pastille toujours « hors liste » | Le texte du QR ne matche pas exactement un nom dans `TOURNEE_POINTS` (souvent une apostrophe droite `'` vs courbe `'`) — éditer la constante pour matcher le QR réel |
| Doublons rapides dans le Sheets | Même pastille relue juste après « Scanner la prochaine » : augmenter `REPRISE_IGNORE_MS` (4 000 ms). Lectures multiples d'une même image : `MULTI_FRAME_WINDOW_MS` (1 500 ms). Les deux sont dans `docs/index.html` |
| « Le module de scan n'a pas pu se charger » | Le fichier `docs/vendor/html5-qrcode-2.3.8.min.js` n'est pas arrivé (signal coupé pendant l'ouverture) : fermer et rouvrir l'app avec du signal |
| Lignes suspectes dans le Sheets (pas venues d'une tournée) | Quelqu'un a trouvé le secret partagé (il est forcément public : repo + code source de la page). Changer le secret dans `apps-script/Code.gs` **et** `docs/index.html`, puis redéployer les deux (workflows ci-dessus) |
| Sync qui répond `busy` | Normal si deux téléphones synchronisent au même instant (verrou 30 s côté backend). Les scans restent en attente sur le téléphone et repartent au prochain essai — rien à faire |
