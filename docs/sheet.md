# The sheet

The site has one piece of backend, and it is a Google Sheet. Visitors' fortunes
land in it for you to read; cookies eaten are logged in it by country. The site
talks to it through a Google Apps Script bound to the sheet. No database, no
packages.

## Set up, once

1. Make a Google Sheet with two tabs, named exactly `Inbox` and `Eats`.
   - `Inbox`, row 1: `Time`, `Fortune`, `Country`, `Approved`
   - `Eats`, row 1: `Time`, `Country`
2. In the sheet: **Extensions → Apps Script**. Replace the editor's contents with
   `scripts/fortune-sheet.gs` from this repo.
3. Change `TOKEN` at the top to something long and private.
4. **Deploy → New deployment → Web app.** Execute as **Me**; who has access
   **Anyone**. Authorise it. Copy the web app URL (it ends in `/exec`).
5. In Vercel (Project → Settings → Environment Variables), and in `.env.local`
   for development:

       FORTUNE_SHEET_URL=https://script.google.com/macros/s/…/exec
       FORTUNE_SHEET_TOKEN=the same value as TOKEN

Redeploy. Without these two, both features quietly switch themselves off.

## Moderating

Open the `Inbox` tab. Each fortune is a row. The `Approved` column is yours —
tick it, write `yes`, whatever you like. Nothing is published from the sheet
automatically; approved fortunes are added to `src/lib/fortunes.ts` by hand,
which is deliberate: the pool is curated, and the sheet is the reading pile.

## What the sheet knows

- A fortune's text (already stripped of links, handles and phone-shaped
  numbers before it left the page), the time, and the visitor's country.
- For eats, the time and the country.
- The country is Vercel's two-letter edge header. The sheet never sees an IP:
  requests reach the script from Vercel, not from the visitor.

If you change the script, **Deploy → Manage deployments → edit → New version**
— editing the code alone does not update the live URL.
