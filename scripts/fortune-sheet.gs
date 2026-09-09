/**
 * kismet - the sheet's side of things.
 *
 * Two tabs, which `setup` makes for you:
 *   Inbox   Time | Fortune | Country | Approved      (Approved is a checkbox)
 *   Eats    Time | Country
 *
 * Once:  paste this in (Extensions -> Apps Script), change TOKEN, run `setup`
 * from the toolbar and allow it, then Deploy -> New deployment -> Web app,
 * Execute as Me, Who has access: Anyone. Put the /exec URL in
 * FORTUNE_SHEET_URL and the same TOKEN in FORTUNE_SHEET_TOKEN.
 *
 * To approve a fortune: tick its box. It is in the pool within five minutes.
 * Untick it and it leaves the same way. See docs/sheet.md.
 */
var TOKEN = 'change-me';
var EATS_TO_KEEP = 8;
var APPROVED_TO_SERVE = 500;

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var inbox = ss.getSheetByName('Inbox') || ss.insertSheet('Inbox');
  if (inbox.getLastRow() === 0) {
    inbox.appendRow(['Time', 'Fortune', 'Country', 'Approved']);
    inbox.setFrozenRows(1);
    inbox.setColumnWidth(2, 520);
  }
  // Checkboxes are added per row as fortunes arrive (see doPost). A column
  // of ready-made ones would count as content, and new rows would land
  // below them. If an earlier version left a column of them, take it back.
  var spare = inbox.getRange(2, 4, Math.max(inbox.getMaxRows() - 1, 1), 1);
  spare.removeCheckboxes();
  spare.clearContent();

  var eats = ss.getSheetByName('Eats') || ss.insertSheet('Eats');
  if (eats.getLastRow() === 0) {
    eats.appendRow(['Time', 'Country']);
    eats.setFrozenRows(1);
  }

  var extra = ss.getSheetByName('Sheet1');
  if (extra && extra.getLastRow() === 0 && ss.getSheets().length > 2) ss.deleteSheet(extra);
}

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
    var inbox = ss.getSheetByName('Inbox');
    inbox.appendRow([new Date(), text, String(body.country || ''), false]);
    inbox.getRange(inbox.getLastRow(), 4).insertCheckboxes();
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
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  if (e.parameter.action === 'eats') {
    var sheet = ss.getSheetByName('Eats');
    var last = sheet.getLastRow();
    var count = Math.min(EATS_TO_KEEP, last - 1);
    if (count <= 0) return reply({ eats: [] });
    var rows = sheet.getRange(last - count + 1, 1, count, 2).getValues();
    return reply({
      eats: rows
        .map(function (row) {
          return { at: new Date(row[0]).getTime(), country: String(row[1] || '') };
        })
        .reverse(),
    });
  }

  if (e.parameter.action === 'approved') {
    var inbox = ss.getSheetByName('Inbox');
    var n = inbox.getLastRow() - 1;
    if (n <= 0) return reply({ fortunes: [] });
    var all = inbox.getRange(2, 2, n, 3).getValues(); // Fortune | Country | Approved
    var fortunes = [];
    for (var i = 0; i < all.length && fortunes.length < APPROVED_TO_SERVE; i++) {
      var approved = all[i][2];
      var yes =
        approved === true ||
        /^(yes|y|true|x|ok)$/i.test(String(approved).trim());
      var text = String(all[i][0] || '').trim();
      if (yes && text) fortunes.push({ text: text, from: String(all[i][1] || '') });
    }
    return reply({ fortunes: fortunes });
  }

  return reply({ ok: false, reason: 'action' });
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
