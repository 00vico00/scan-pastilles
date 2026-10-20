/**
 * Scan to Google Sheets — Tournée des Pastilles
 * Backend Apps Script attaché au Google Sheets existant.
 *
 * Endpoints:
 *   GET  → redirige vers l'app sur GitHub Pages (l'app ne vit plus ici :
 *          l'iframe HtmlService bloque l'accès caméra)
 *   POST → reçoit un lot de scans { scans: [{ts, point}, ...] } et les append
 *
 * Rapport quotidien : rapportTournee() (déclencheur horaire, ~6 h 30) évalue
 * les quarts écoulés et envoie le verdict par courriel — voir la section
 * « Rapport quotidien de tournée » en bas de fichier.
 */

const SHARED_SECRET = 'tournee-pastilles-chr-2026';
const APP_URL = 'https://00vico00.github.io/scan-pastilles/';

// Fenêtre de dédoublonnage : nombre de lignes récentes comparées au lot entrant.
// 300 lignes ≈ 12 jours au rythme observé (~25 scans/jour) — bien plus que la
// durée de vie réaliste d'un scan en attente dans un téléphone.
const DEDUP_WINDOW_ROWS = 300;

function doGet(e) {
  return HtmlService.createHtmlOutput(
    '<p style="font-family:sans-serif;padding:24px">L\'app de scan a déménagé : '
    + '<a href="' + APP_URL + '" target="_top">' + APP_URL + '</a></p>'
    + '<script>try { window.top.location.href = "' + APP_URL + '"; } catch (e) {}</script>'
  ).setTitle('Tournée des Pastilles');
}

function doPost(e) {
  const respond = (obj) => ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);

  try {
    const payload = JSON.parse(e.postData.contents);

    if (payload.secret !== SHARED_SECRET) {
      return respond({ ok: false, error: 'unauthorized' });
    }

    const scans = Array.isArray(payload.scans) ? payload.scans : [];
    if (scans.length === 0) {
      return respond({ ok: true, added: 0 });
    }

    // Sérialise les écritures : deux téléphones qui synchronisent en même temps
    // liraient le même getLastRow() et s'écraseraient mutuellement des lignes.
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(30 * 1000)) {
      return respond({ ok: false, error: 'busy' });
    }

    try {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
      const lastRow = sheet.getLastRow();

      // Idempotence : le téléphone ré-envoie tout lot dont il n'a pas vu la
      // réponse (livraison at-least-once). Le ts, généré une seule fois au
      // moment du scan, est identique à la milliseconde dans un re-POST —
      // alors qu'un vrai re-scan de l'opérateur porte un ts différent. On
      // écarte donc tout scan dont la clé (epoch ms + point) figure déjà
      // dans les lignes récentes. En cas de doute, on écrit (jamais de perte).
      const seen = new Set();
      const windowSize = Math.min(DEDUP_WINDOW_ROWS, lastRow);
      if (windowSize > 0) {
        const recent = sheet.getRange(lastRow - windowSize + 1, 1, windowSize, 2).getValues();
        recent.forEach(r => {
          if (r[0] instanceof Date) seen.add(r[0].getTime() + '|' + String(r[1]));
        });
      }

      const rows = [];
      scans.forEach(s => {
        const key = new Date(s.ts).getTime() + '|' + String(s.point);
        if (seen.has(key)) return;
        seen.add(key); // couvre aussi un doublon interne au lot
        rows.push([new Date(s.ts), String(s.point), 1]);
      });

      if (rows.length > 0) {
        const startRow = lastRow + 1;
        sheet.getRange(startRow, 1, rows.length, 3).setValues(rows);
        sheet.getRange(startRow, 1, rows.length, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
      }

      // added = lignes réellement écrites ; un lot entièrement déjà connu
      // répond {ok:true, added:0} et le téléphone purge sa file normalement.
      return respond({ ok: true, added: rows.length });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return respond({ ok: false, error: err.toString() });
  }
}

/**
 * Fonction utilitaire pour tester depuis l'éditeur Apps Script.
 * Exécute-la une fois après le déploiement pour vérifier l'écriture.
 */
function testWrite() {
  const fakeEvent = {
    postData: {
      contents: JSON.stringify({
        secret: SHARED_SECRET,
        scans: [
          { ts: new Date().toISOString(), point: 'TEST - À supprimer' }
        ]
      })
    }
  };
  const result = doPost(fakeEvent);
  Logger.log(result.getContent());
}

// ====================================================================
// Rapport quotidien de tournée
// ====================================================================
// La tournée prouve que la surveillance incendie a été faite par
// l'opérateur présent quand l'usine est fermée. Quarts évalués :
//   nuit = 18 h → 6 h (toutes les nuits)
//   jour = 6 h → 18 h (samedi et dimanche seulement)
// Le rapport du matin (déclencheur ~6 h 30) couvre les quarts écoulés
// depuis le rapport précédent : 1 fenêtre en semaine, 2 les dimanche
// et lundi matin. Il part TOUJOURS (trace quotidienne : l'absence de
// courriel est elle-même un signal de panne).
//
// Destinataires : Script Property RAPPORT_DESTINATAIRES (adresses
// séparées par des virgules) — jamais dans le code, le dépôt est public.

// Doit rester identique à TOURNEE_POINTS dans docs/index.html
// (le texte des QR fait foi).
const POINTS_ATTENDUS = [
  '1- Cases Transformation (Bas escalier)',
  '2- Garage mécanique',
  "3- Fournaise à l'huile Rabotage",
  '4- Cabane à planure',
  '5- Dépoussiéreur',
  '6- Séchoir - Salle des machines 1-4',
  '7- Bouilloire - Salle des machines',
  '8- Séchoir - Salle des machines 5-6',
  '9- Bureau du syndicat',
  '10- Entrepôt A Compresseur',
  '11- Garage rond',
  '12- Réservoir à fuel diésel',
  "13- Transformation - Fournaise à l'huile",
  '14- Transformation - Compresseur à air',
  '15- Transformation - Déchiqueteuse',
  '16- Transformation - Bureau Autolog',
  '17- Cabane du planeur 4',
  '18- Cabane du planeur 1',
  '19- Cabane du planeur 3'
];

// Lignes relues en fin de feuille pour couvrir les fenêtres évaluées
// (≈ 24 h + marge ; au pire ~100 scans/jour observés un dimanche).
const RAPPORT_LIGNES_LUES = 500;

// Marge avant le début nominal d'une fenêtre : une tournée commencée un
// peu avant le quart compte pour ce quart (cas réel du 2026-10-18 :
// premier scan à 17 h 59 min 42 s pour la tournée de nuit). La fin de
// fenêtre reste stricte.
const MARGE_DEBUT_MIN = 60;

const FR_JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const FR_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function frDate(d) {
  return FR_JOURS[d.getDay()] + ' ' + d.getDate() + ' ' + FR_MOIS[d.getMonth()];
}
function frHeure(epochMs) {
  const d = new Date(epochMs);
  const m = d.getMinutes();
  return d.getHours() + ' h' + (m > 0 ? ' ' + (m < 10 ? '0' : '') + m : '');
}

/** Point d'entrée du déclencheur quotidien. */
function rapportTournee() {
  const destinataires = PropertiesService.getScriptProperties()
    .getProperty('RAPPORT_DESTINATAIRES');
  if (!destinataires) {
    Logger.log('Script Property RAPPORT_DESTINATAIRES absente — aucun envoi.');
    return;
  }
  const rapport = construireRapport(new Date());
  MailApp.sendEmail({
    to: destinataires,
    subject: rapport.objet,
    body: rapport.corps,
    name: 'Tournée des Pastilles'
  });
}

/** Prévisualise le rapport dans le journal, sans rien envoyer. */
function apercuRapport() {
  const rapport = construireRapport(new Date());
  Logger.log(rapport.objet + '\n\n' + rapport.corps);
}

/** Crée (ou recrée) le déclencheur quotidien de 6 h. À exécuter une fois. */
function installerDeclencheur() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'rapportTournee') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('rapportTournee')
    .timeBased().everyDays(1).atHour(6).nearMinute(30).create();
  Logger.log('Déclencheur quotidien installé (rapportTournee, ~6 h 30).');
}

/** Fenêtres de quart à évaluer un matin donné. */
function fenetresAEvaluer(maintenant) {
  const borneMatin = new Date(maintenant.getFullYear(), maintenant.getMonth(),
    maintenant.getDate(), 6, 0, 0);
  const veille = new Date(maintenant.getFullYear(), maintenant.getMonth(),
    maintenant.getDate() - 1, 6, 0, 0);
  const veille18 = new Date(veille.getFullYear(), veille.getMonth(),
    veille.getDate(), 18, 0, 0);

  const fenetres = [];
  // Dimanche et lundi matin : la veille (samedi/dimanche) avait aussi
  // un quart de jour à surveiller (usine fermée le weekend).
  const jour = maintenant.getDay();
  if (jour === 0 || jour === 1) {
    fenetres.push({
      nom: 'jour',
      debut: veille,
      fin: veille18,
      titre: 'Jour du ' + frDate(veille) + ' (6 h → 18 h)',
      court: 'jour du ' + frDate(veille).replace(/^\S+ /, '')
    });
  }
  fenetres.push({
    nom: 'nuit',
    debut: veille18,
    fin: borneMatin,
    titre: 'Nuit du ' + frDate(veille) + ' au ' + frDate(borneMatin) + ' (18 h → 6 h)',
    court: 'nuit du ' + veille.getDate() + ' au ' + borneMatin.getDate() + ' ' + FR_MOIS[borneMatin.getMonth()]
  });
  return fenetres;
}

/** Verdict d'une fenêtre à partir des lignes [date, point] relues. */
function evaluerFenetre(fenetre, lignes) {
  const vus = {};
  const horsListe = {};
  let nbScans = 0;
  let premier = null;
  let dernier = null;

  const debutEval = fenetre.debut.getTime() - MARGE_DEBUT_MIN * 60 * 1000;
  lignes.forEach(function (r) {
    if (!(r[0] instanceof Date)) return;
    const t = r[0].getTime();
    if (t < debutEval || t >= fenetre.fin.getTime()) return;
    const point = String(r[1]);
    nbScans++;
    if (premier === null || t < premier) premier = t;
    if (dernier === null || t > dernier) dernier = t;
    if (POINTS_ATTENDUS.indexOf(point) >= 0) vus[point] = true;
    else horsListe[point] = true;
  });

  const manquants = POINTS_ATTENDUS.filter(function (p) { return !vus[p]; });
  return {
    fenetre: fenetre,
    nbScans: nbScans,
    premier: premier,
    dernier: dernier,
    nbVus: POINTS_ATTENDUS.length - manquants.length,
    manquants: manquants,
    horsListe: Object.keys(horsListe)
  };
}

/** Compose l'objet et le corps du courriel pour un matin donné. */
function construireRapport(maintenant) {
  const fenetres = fenetresAEvaluer(maintenant);

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const lastRow = sheet.getLastRow();
  const n = Math.min(RAPPORT_LIGNES_LUES, lastRow);
  const lignes = n > 0 ? sheet.getRange(lastRow - n + 1, 1, n, 2).getValues() : [];

  const sections = fenetres.map(function (f) { return evaluerFenetre(f, lignes); });
  const total = POINTS_ATTENDUS.length;
  const tousComplets = sections.every(function (s) { return s.manquants.length === 0; });

  function verdictCourt(s) {
    if (s.manquants.length === 0) return 'COMPLÈTE';
    return 'INCOMPLÈTE (' + s.manquants.length + ' manquant' + (s.manquants.length > 1 ? 's' : '') + ')';
  }

  let objet;
  if (sections.length === 1) {
    objet = (tousComplets ? '✅' : '⚠') + ' Tournée des Pastilles — '
      + sections[0].fenetre.court + ' : ' + verdictCourt(sections[0]);
  } else {
    const veille = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() - 1);
    objet = (tousComplets ? '✅' : '⚠') + ' Tournées des Pastilles — '
      + frDate(veille) + ' : '
      + sections.map(function (s) { return s.fenetre.nom + ' ' + verdictCourt(s); }).join(' · ');
  }

  const blocs = sections.map(function (s) {
    const l = [s.fenetre.titre];
    l.push('Verdict : ' + verdictCourt(s) + ' — ' + s.nbVus + ' point' + (s.nbVus > 1 ? 's' : '') + ' sur ' + total);
    if (s.nbScans === 0) {
      l.push('Aucun scan reçu pendant cette fenêtre.');
    } else {
      l.push('Premier scan ' + frHeure(s.premier) + ' · dernier ' + frHeure(s.dernier)
        + ' · ' + s.nbScans + ' scans reçus');
    }
    if (s.manquants.length > 0 && s.nbScans > 0) {
      l.push('Points manquants :');
      s.manquants.forEach(function (p) { l.push('  • ' + p); });
    }
    if (s.horsListe.length > 0) {
      l.push('Scans hors liste : ' + s.horsListe.join(' ; '));
    }
    return l.join('\n');
  });

  const pied = 'Généré le ' + frDate(maintenant) + ' à ' + frHeure(maintenant.getTime())
    + ' selon les données synchronisées dans le Google Sheets.\n'
    + 'Un téléphone resté hors signal peut synchroniser ses scans après coup : '
    + 'en cas de doute, revérifier le Sheets.\n\n'
    + '— Rapport automatique (Apps Script « Tournée des Pastilles »)';

  return { objet: objet, corps: blocs.join('\n\n---\n\n') + '\n\n' + pied };
}
