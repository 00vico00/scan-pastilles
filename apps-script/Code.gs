/**
 * Scan to Google Sheets — Tournée des Pastilles
 * Backend Apps Script attaché au Google Sheets existant.
 *
 * Endpoints:
 *   GET  → sert la PWA (page de scan)
 *   POST → reçoit un lot de scans { scans: [{ts, point}, ...] } et les append
 */

const SHARED_SECRET = 'tournee-pastilles-chr-2026';

function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Tournée des Pastilles')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    const rows = scans.map(s => [new Date(s.ts), String(s.point), 1]);

    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rows.length, 3).setValues(rows);

    sheet.getRange(startRow, 1, rows.length, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');

    return respond({ ok: true, added: rows.length });
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
