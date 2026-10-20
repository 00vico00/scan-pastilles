/**
 * Scan to Google Sheets — Tournée des Pastilles
 * Backend Apps Script attaché au Google Sheets existant.
 *
 * Endpoints:
 *   GET  → redirige vers l'app sur GitHub Pages (l'app ne vit plus ici :
 *          l'iframe HtmlService bloque l'accès caméra)
 *   POST → reçoit un lot de scans { scans: [{ts, point}, ...] } et les append
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
