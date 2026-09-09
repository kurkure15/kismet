# The sheet

The site has one piece of backend, and it is a Google Sheet. Visitors' fortunes
land in it; you tick the ones you like and they go into the cookies; cookies
eaten are logged in it by country. The site talks to it through a Google Apps
Script bound to the sheet. No database, no packages.

The sheet: https://docs.google.com/spreadsheets/d/1TC02SKPBcQdNGAJ3n-g2S6cF3d6czrMFG3c9DKIHViI

## Set up, once

1. Open the sheet. **Extensions → Apps Script.** Replace the editor's contents
   with `scripts/fortune-sheet.gs` from this repo.
2. Change `TOKEN` at the top to something long and private. Save.
3. In the toolbar, choose the function **`setup`** and press **Run**. Allow it
   when asked. This makes the two tabs — `Inbox` and `Eats` — with their
   headings, and turns the `Approved` column into checkboxes.
4. **Deploy → New deployment → Web app.** Execute as **Me**; who has access
   **Anyone**. Authorise it. Copy the web app URL (it ends in `/exec`).
5. In Vercel (Project → Settings → Environment Variables), for Production and
   Preview, and in `.env.local` for development:

       FORTUNE_SHEET_URL=https://script.google.com/macros/s/…/exec
       FORTUNE_SHEET_TOKEN=the same value as TOKEN

   Redeploy. Without these two, everything below quietly switches itself off.

## Approving

Open the `Inbox` tab. Each fortune is a row: when it arrived, the words, the
two-letter country it was sent from, and a checkbox.

**Tick the box.** That is the whole thing. The site asks the sheet for ticked
rows and caches the answer for five minutes, so a newly ticked fortune is in
the pool for the next visitor within about five minutes; anyone already on
the page gets it on their next visit. Untick it and it leaves the same way.
Delete the row if you never want to see it again.

A fortune from the sheet is printed with "sent from Japan" (or wherever) at
its foot. If the Country cell is blank — the visitor's country could not be
told — it is printed without.

You can also edit the words before ticking. What is in the cell is what is
printed.

## What the sheet knows

- A fortune's text (already stripped of links, handles and phone-shaped
  numbers before it left the page), the time, and the visitor's country.
- For eats, the time and the country.
- The country is Vercel's two-letter edge header. The sheet never sees an IP:
  requests reach the script from Vercel, not from the visitor.

If you change the script, **Deploy → Manage deployments → edit → New version**
— editing the code alone does not update the live URL.
