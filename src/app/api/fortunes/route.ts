import { NextResponse } from 'next/server';
import { cleanFortune } from '@/lib/inbox';
import { countryOf, sheetConfigured, submitFortune } from '@/lib/sheet';

/** A visitor's fortune, on its way to the inbox tab of the sheet. */
export async function POST(request: Request) {
  if (!sheetConfigured()) {
    return NextResponse.json({ ok: false, reason: 'unconfigured' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid' }, { status: 400 });
  }

  const text = cleanFortune((body as { text?: unknown })?.text);
  if (!text) {
    return NextResponse.json({ ok: false, reason: 'invalid' }, { status: 400 });
  }

  const ok = await submitFortune(text, countryOf(request));
  return NextResponse.json({ ok }, { status: ok ? 200 : 502 });
}
