# Déploiement — Scan to Google Sheets

## Étape 1 — Ouvrir l'éditeur Apps Script du Sheets existant

1. Connecte-toi au **compte Google des opérateurs**.
2. Ouvre le Google Sheets de la tournée des pastilles (celui d'où vient `Tournée des Pastilles.xlsx`).
3. Menu **Extensions → Apps Script**. Un nouvel onglet s'ouvre.
4. Renomme le projet (en haut à gauche) en `Scan Tournée Pastilles`.

## Étape 2 — Coller les deux fichiers

Dans l'éditeur Apps Script :

**Fichier `Code.gs`** (déjà présent à l'ouverture, en vide) :
- Efface tout son contenu
- Copie-colle le contenu complet de [`apps-script/Code.gs`](apps-script/Code.gs)
- Sauvegarde (`Ctrl+S`)

**Fichier `Index.html`** :
- Clic sur le **+** à côté de "Fichiers" → **HTML**
- Nomme-le exactement `Index` (sans extension, Apps Script ajoute `.html` automatiquement)
- Efface le contenu par défaut
- Copie-colle le contenu complet de [`apps-script/Index.html`](apps-script/Index.html)
- Sauvegarde (`Ctrl+S`)

## Étape 3 — Tester l'écriture (optionnel mais recommandé)

1. Dans l'éditeur, ouvre `Code.gs`
2. En haut, sélectionne la fonction **`testWrite`** dans le menu déroulant
3. Clic sur **Exécuter** (▶)
4. Google va demander des autorisations — accepte avec le compte opérateur
5. Va vérifier le Sheets : une ligne `TEST - À supprimer` devrait apparaître à la fin. **Supprime-la après** vérification.

## Étape 4 — Déployer comme application web

1. En haut à droite de l'éditeur Apps Script, clic sur **Déployer → Nouveau déploiement**
2. Roue dentée à côté de "Sélectionner le type" → **Application Web**
3. Configuration :
   - **Description** : `v1`
   - **Exécuter en tant que** : *Moi (compte opérateur)*
   - **Qui a accès** : *Tout le monde* (anonyme, sans login Google)
4. Clic **Déployer**
5. **Copie l'URL de l'application Web** qui s'affiche — c'est l'URL à utiliser sur les téléphones.

> ⚠️ Note : si tu modifies le code plus tard, il faut faire **Déployer → Gérer les déploiements → ✎ Modifier → Version : Nouvelle version → Déployer**. Sinon les téléphones reçoivent l'ancienne version.

## Étape 5 — Installer sur les téléphones des opérateurs

Sur chaque téléphone Android :

1. Ouvrir **Chrome**
2. Aller à l'URL de l'application Web (de l'étape 4)
3. Menu Chrome (⋮) → **Ajouter à l'écran d'accueil**
4. Confirmer — une icône apparaît, l'app s'ouvre en plein écran
5. Au premier lancement, accepter l'accès à la caméra

## Étape 6 — Tester sur le terrain

- Scanner une pastille → la ligne doit apparaître dans le Sheets
- Activer le mode avion → scanner plusieurs pastilles → le badge "X en attente" doit grimper
- Désactiver le mode avion → tout doit se synchroniser automatiquement

---

## Fonctionnement (résumé)

| Comportement | Détail |
|---|---|
| **Anti-doublon** | Même point scanné dans les 8 secondes → ignoré (flash orange) |
| **Hors ligne** | Tous les scans restent en mémoire locale (IndexedDB) sur le téléphone |
| **Reconnexion** | Sync auto au retour en ligne + toutes les 30 secondes |
| **Bouton "Synchroniser"** | Force une tentative manuelle (utile pour valider) |
| **Feedback** | Flash vert + bip aigu + vibration = OK · Flash orange + bip grave = doublon |

## Sécurité

L'URL de l'app contient un identifiant non devinable (généré par Google). Le code inclut aussi un secret (`SHARED_SECRET` dans `Code.gs`) qui doit matcher entre frontend et backend. Si tu veux le changer un jour :
1. Modifier la constante `SHARED_SECRET` dans `Code.gs`
2. Modifier la valeur correspondante dans `Index.html` (chercher `tournee-pastilles-chr-2026`)
3. Redéployer

## Dépannage

| Problème | Solution |
|---|---|
| « Impossible d'accéder à la caméra » | Vérifier permissions Chrome · l'URL doit être en HTTPS (Apps Script l'est par défaut) |
| Scans ne se synchronisent pas | Vérifier que l'URL de déploiement est la dernière version · vérifier signal réseau |
| Le QR n'est pas détecté | Nettoyer la pastille · plus de lumière · approcher/éloigner le téléphone |
| Doublons dans le Sheets | Augmenter `DEDUP_WINDOW_MS` dans `Index.html` (actuellement 8000 ms) |
