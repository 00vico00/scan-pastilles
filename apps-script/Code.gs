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
      const rows = scans.map(s => [new Date(s.ts), String(s.point), 1]);

      const startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, rows.length, 3).setValues(rows);

      sheet.getRange(startRow, 1, rows.length, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');

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
