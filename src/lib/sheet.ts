/**
 * The site's one piece of backend: a Google Sheet, reached through a Google
 * Apps Script web app bound to it. Two tabs — Inbox, where visitors' fortunes
 * land for reading, and Eats, a log of cookies eaten by country.
 *
 * Talking to it is a fetch with a shared token, nothing more. Both env vars
 * come from the deployment; without them every call reports itself
 * unconfigured and the page carries on without the feature.
 *
 * See docs/sheet.md for the script and the setup.
 */

export type Eat = { at: number; country: string };

function config() {
  const url = process.env.FORTUNE_SHEET_URL;
  const token = process.env.FORTUNE_SHEET_TOKEN;
  return url && token ? { url, token } : null;
}

export const sheetConfigured = () => config() !== null;

/**
 * The visitor's country, two letters, as Vercel reports it at the edge. This
 * is all the site ever knows about where anyone is: not a city, not an
 * address, and the sheet only ever sees Vercel's IP, never the visitor's.
 */
export function countryOf(request: Request) {
  const code = request.headers.get('x-vercel-ip-country') ?? '';
  return /^[A-Z]{2}$/.test(code) ? code : '';
}

/**
 * Apps Script answers a POST with a redirect to the rendered output, which
 * fetch follows as a GET — that is fine, the script has already run by then
 * and the redirect only carries its reply.
 */
async function post(body: Record<string, unknown>) {
  const c = config();
  if (!c) return false;
  try {
    const res = await fetch(c.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: c.token, ...body }),
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const submitFortune = (text: string, country: string) =>
  post({ action: 'fortune', text, country });

export const recordEat = (country: string) => post({ action: 'eat', country });

/**
 * The last few eats, newest first. Cached for ten seconds on the server, so
 * however many people are on the page, the sheet is asked once per interval.
 */
export async function recentEats(): Promise<Eat[]> {
  const c = config();
  if (!c) return [];
  try {
    const url = new URL(c.url);
    url.searchParams.set('token', c.token);
    url.searchParams.set('action', 'eats');
    const res = await fetch(url, { next: { revalidate: 10 } });
    if (!res.ok) return [];
    const data = (await res.json()) as { eats?: unknown };
    if (!Array.isArray(data.eats)) return [];
    return data.eats
      .filter(
        (e): e is Eat =>
          typeof e === 'object' &&
          e !== null &&
          typeof (e as Eat).at === 'number' &&
          typeof (e as Eat).country === 'string',
      )
      .slice(0, 8);
  } catch {
    return [];
  }
}
