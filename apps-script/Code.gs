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

// Feuille des scans, repérée par son identifiant (gid) et non par sa position :
// l'onglet « Fermetures » vit à côté, et un onglet déplacé en tête ne doit
// jamais recevoir les scans.
const FEUILLE_SCANS_ID = 0;

// Longueur maximale gardée pour le texte d'un QR (les vrais font < 50 car.).
const POINT_MAX_CAR = 200;

function feuilleScans() {
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheets()
    .find(s => s.getSheetId() === FEUILLE_SCANS_ID);
  // Pas de repli sur une autre feuille : mieux vaut que le téléphone garde
  // ses scans en attente que de les écrire au mauvais endroit.
  if (!feuille) throw new Error('feuille des scans introuvable (gid ' + FEUILLE_SCANS_ID + ')');
  return feuille;
}

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
      const sheet = feuilleScans();
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

      // Colonne D = heure de réception par le serveur. Comparée à la colonne A
      // (heure du scan, horloge du téléphone), elle mesure le délai de synchro
      // et trahit une horloge fausse ou un scan antidaté.
      const recuLe = new Date();
      const rows = [];
      scans.forEach(s => {
        // Entrée illisible écartée sans bloquer le lot : sinon le téléphone
        // la ré-enverrait à chaque essai et toute sa file resterait coincée.
        if (!s || typeof s.point !== 'string' || s.point === '') return;
        const date = new Date(s.ts);
        if (isNaN(date.getTime())) return;
        const point = s.point.slice(0, POINT_MAX_CAR);
        const key = date.getTime() + '|' + point;
        if (seen.has(key)) return;
        seen.add(key); // couvre aussi un doublon interne au lot
        rows.push([date, point, 1, recuLe]);
      });

      if (rows.length > 0) {
        const startRow = lastRow + 1;
        sheet.getRange(startRow, 1, rows.length, 4).setValues(rows);
        sheet.getRange(startRow, 1, rows.length, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
        sheet.getRange(startRow, 4, rows.length, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
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
 * Écrit une ligne de test puis la retire (le Sheets est celui de production).
 */
function testWrite() {
  const marque = 'TEST - À supprimer';
  const fakeEvent = {
    postData: {
      contents: JSON.stringify({
        secret: SHARED_SECRET,
        scans: [
          { ts: new Date().toISOString(), point: marque }
        ]
      })
    }
  };
  const result = doPost(fakeEvent);
  Logger.log(result.getContent());

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) {
    Logger.log('Verrou occupé : retirer la ligne « ' + marque + ' » à la main.');
    return;
  }
  try {
    const sheet = feuilleScans();
    const last = sheet.getLastRow();
    if (sheet.getRange(last, 2).getValue() === marque) {
      sheet.deleteRow(last);
      Logger.log('Ligne de test retirée.');
    } else {
      Logger.log('Ligne de test introuvable en fin de feuille : la chercher à la main.');
    }
  } finally {
    lock.releaseLock();
  }
}

// ====================================================================
// Rapport quotidien de tournée
// ====================================================================
// La tournée prouve que la surveillance incendie a été faite par
// l'opérateur présent quand l'usine est fermée : une tournée complète
// dans chaque quart où les opérations sont à l'arrêt.
//   nuit = 18 h → 6 h (toutes les nuits)
//   jour = 6 h → 18 h (samedi, dimanche et jours inscrits dans l'onglet
//          « Fermetures » : fériés, arrêts)
// Le rapport du matin (déclencheur ~6 h 30) couvre les quarts écoulés
// depuis le rapport précédent : la nuit, plus le jour de la veille s'il
// était surveillé. Il part TOUJOURS (trace quotidienne : l'absence de
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

// Bornes des quarts strictes : 6 h et 18 h (Nicholas, 2026-10-20). Une
// tournée faite à la toute fin du quart peut déborder de quelques minutes,
// ou commencer juste avant (2026-10-18 : premier scan à 17 h 59 min 42 s).
// Les scans sont donc regroupés en suites : un écart de ECART_SUITE_MIN ou
// plus entre deux scans, ou un point déjà vu dans la suite et rescanné
// NOUVEAU_PASSAGE_MIN plus tard (deux tournées dos à dos), ouvre une
// nouvelle suite. Une suite à cheval sur une borne compte EN ENTIER pour
// le quart où tombe la majorité de ses scans (égalité : le quart qui se
// termine). Chaque scan ne compte que pour un quart.
const ECART_SUITE_MIN = 20;
const NOUVEAU_PASSAGE_MIN = 10;

// Onglet des jours de semaine où l'usine est fermée (fériés, arrêts) :
// colonne A = date, colonne B = libellé (facultatif), ligne 1 = en-têtes.
const ONGLET_FERMETURES = 'Fermetures';

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
function cleJour(d) {
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

/** Quart d'un instant : 'J AAAA-MM-JJ' (6 h → 18 h) ou 'N AAAA-MM-JJ' (nuit commencée ce jour-là à 18 h). */
function cleQuart(epochMs) {
  const d = new Date(epochMs);
  const h = d.getHours();
  if (h >= 6 && h < 18) return 'J ' + cleJour(d);
  if (h >= 18) return 'N ' + cleJour(d);
  return 'N ' + cleJour(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
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

/**
 * Jours de fermeture lus dans l'onglet ONGLET_FERMETURES :
 * { 'AAAA-MM-JJ': libellé }, ou null si l'onglet n'existe pas.
 */
function lireFermetures(ss) {
  const feuille = ss.getSheetByName(ONGLET_FERMETURES);
  if (!feuille) return null;
  const fermetures = {};
  const n = feuille.getLastRow() - 1;
  if (n < 1) return fermetures;
  feuille.getRange(2, 1, n, 2).getValues().forEach(function (r) {
    let cle = null;
    if (r[0] instanceof Date) cle = cleJour(r[0]);
    else if (/^\d{4}-\d{2}-\d{2}$/.test(String(r[0]).trim())) cle = String(r[0]).trim();
    if (cle) fermetures[cle] = String(r[1] || '').trim();
  });
  return fermetures;
}

/** Fenêtres de quart à évaluer un matin donné. */
function fenetresAEvaluer(maintenant, fermetures) {
  const veille = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() - 1);
  const matin = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());

  const fenetres = [];
  // Quart de jour de la veille : surveillé le samedi, le dimanche et les
  // jours de fermeture (l'usine ne tourne pas).
  const fermeture = fermetures ? fermetures[cleJour(veille)] : undefined;
  const finDeSemaine = veille.getDay() === 0 || veille.getDay() === 6;
  if (finDeSemaine || fermeture !== undefined) {
    fenetres.push({
      nom: 'jour',
      quart: 'J ' + cleJour(veille),
      titre: 'Jour du ' + frDate(veille) + ' (6 h → 18 h)' + (fermeture ? ' — ' + fermeture : ''),
      court: 'jour du ' + frDate(veille).replace(/^\S+ /, '')
    });
  }
  fenetres.push({
    nom: 'nuit',
    quart: 'N ' + cleJour(veille),
    titre: 'Nuit du ' + frDate(veille) + ' au ' + frDate(matin) + ' (18 h → 6 h)',
    court: 'nuit du ' + veille.getDate() + ' au ' + matin.getDate() + ' ' + FR_MOIS[matin.getMonth()]
  });
  return fenetres;
}

/**
 * Range chaque scan dans un seul quart (voir ECART_SUITE_MIN). Les lignes
 * [date, point] sont dédoublonnées (doublons de transport d'avant le
 * 2026-10-20) et triées (un lot resté hors ligne arrive en retard).
 */
function rangerParQuart(lignes) {
  const dejaLu = {};
  const scans = [];
  lignes.forEach(function (r) {
    if (!(r[0] instanceof Date)) return;
    const t = r[0].getTime();
    const point = String(r[1]);
    if (dejaLu[t + '|' + point]) return;
    dejaLu[t + '|' + point] = true;
    scans.push({ t: t, point: point, quart: cleQuart(t) });
  });
  scans.sort(function (a, b) { return a.t - b.t; });

  const ecart = ECART_SUITE_MIN * 60 * 1000;
  const nouveauPassage = NOUVEAU_PASSAGE_MIN * 60 * 1000;
  let suite = [];
  let vuDansSuite = {};
  scans.forEach(function (s) {
    const prec = suite.length > 0 ? suite[suite.length - 1] : null;
    const vu = vuDansSuite[s.point];
    if (prec && (s.t - prec.t >= ecart || (vu !== undefined && s.t - vu >= nouveauPassage))) {
      attribuerSuite(suite);
      suite = [];
      vuDansSuite = {};
    }
    suite.push(s);
    vuDansSuite[s.point] = s.t;
  });
  attribuerSuite(suite);
  return scans;
}

/** Une suite à cheval sur une borne va en entier au quart majoritaire. */
function attribuerSuite(suite) {
  const compte = {};
  const ordre = [];
  suite.forEach(function (s) {
    if (!(s.quart in compte)) { compte[s.quart] = 0; ordre.push(s.quart); }
    compte[s.quart]++;
  });
  if (ordre.length < 2) return;
  let gagnant = ordre[0];
  ordre.forEach(function (q) { if (compte[q] > compte[gagnant]) gagnant = q; });
  suite.forEach(function (s) { s.quart = gagnant; });
}

/** Verdict d'une fenêtre à partir des scans rangés par quart. */
function evaluerFenetre(fenetre, scans) {
  const vus = {};
  const horsListe = {};
  let nbScans = 0;
  let premier = null;
  let dernier = null;

  scans.forEach(function (s) {
    if (s.quart !== fenetre.quart) return;
    nbScans++;
    if (premier === null || s.t < premier) premier = s.t;
    if (dernier === null || s.t > dernier) dernier = s.t;
    if (POINTS_ATTENDUS.indexOf(s.point) >= 0) vus[s.point] = true;
    else horsListe[s.point] = true;
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const fermetures = lireFermetures(ss);
  const fenetres = fenetresAEvaluer(maintenant, fermetures);

  const sheet = feuilleScans();
  const lastRow = sheet.getLastRow();
  const n = Math.min(RAPPORT_LIGNES_LUES, lastRow);
  const lignes = n > 0 ? sheet.getRange(lastRow - n + 1, 1, n, 2).getValues() : [];
  const scans = rangerParQuart(lignes);

  const sections = fenetres.map(function (f) { return evaluerFenetre(f, scans); });
  const total = POINTS_ATTENDUS.length;
  const tousComplets = sections.every(function (s) { return s.manquants.length === 0; });

  function verdictCourt(s) {
    if (s.manquants.length === 0) return 'COMPLÈTE';
    if (s.nbScans === 0) return 'AUCUN SCAN';
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
      l.push('Aucun scan reçu pendant ce quart.');
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
    + 'Quarts 6 h → 18 h et 18 h → 6 h ; une tournée à cheval sur 6 h ou 18 h '
    + 'compte pour le quart où tombent la plupart de ses scans.\n'
    + 'Un téléphone resté hors signal peut synchroniser ses scans après coup : '
    + 'en cas de doute, revérifier le Sheets.\n'
    + (fermetures === null
      ? '⚠ Onglet « ' + ONGLET_FERMETURES + ' » introuvable : seuls les samedis et dimanches sont surveillés de jour.\n'
      : '')
    + '\n— Rapport automatique (Apps Script « Tournée des Pastilles »)';

  return { objet: objet, corps: blocs.join('\n\n---\n\n') + '\n\n' + pied };
}
