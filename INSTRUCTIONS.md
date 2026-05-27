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
| **Backend** (`Code.gs`) | Endpoint POST qui ajoute les lignes au Sheets | Google Apps Script attaché au Sheets de la tournée |
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
