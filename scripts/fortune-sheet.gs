/**
 * kismet — the sheet's side of things.
 *
 * Bound to a Google Sheet with two tabs:
 *   Inbox   Time | Fortune | Country | Approved
 *   Eats    Time | Country
 *
 * Deploy as a web app (Execute as: me; Who has access: Anyone) and put the
 * /exec URL in FORTUNE_SHEET_URL. Change TOKEN, and put the same value in
 * FORTUNE_SHEET_TOKEN. See docs/sheet.md.
 */
var TOKEN = 'change-me';
var EATS_TO_KEEP = 8;

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply({ ok: false, reason: 'invalid' });
  }
  if (body.token !== TOKEN) return reply({ ok: false, reason: 'token' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (body.action === 'fortune') {
    var text = String(body.text || '').slice(0, 120);
    if (!text) return reply({ ok: false, reason: 'empty' });
    ss.getSheetByName('Inbox').appendRow([new Date(), text, String(body.country || ''), '']);
    return reply({ ok: true });
  }
  if (body.action === 'eat') {
    ss.getSheetByName('Eats').appendRow([new Date(), String(body.country || '')]);
    return reply({ ok: true });
  }
  return reply({ ok: false, reason: 'action' });
}

function doGet(e) {
  if (!e.parameter || e.parameter.token !== TOKEN) return reply({ ok: false, reason: 'token' });
  if (e.parameter.action !== 'eats') return reply({ ok: false, reason: 'action' });

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Eats');
  var last = sheet.getLastRow();
  var count = Math.min(EATS_TO_KEEP, last - 1);
  if (count <= 0) return reply({ eats: [] });

  var rows = sheet.getRange(last - count + 1, 1, count, 2).getValues();
  var eats = rows
    .map(function (row) {
      return { at: new Date(row[0]).getTime(), country: String(row[1] || '') };
    })
    .reverse();
  return reply({ eats: eats });
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
