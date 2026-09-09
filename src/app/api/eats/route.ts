import { NextResponse } from 'next/server';
import { countryOf, recentEats, recordEat, sheetConfigured } from '@/lib/sheet';

/** The page reports a cookie eaten. Country only, from the edge header. */
export async function POST(request: Request) {
  if (!sheetConfigured()) {
    return NextResponse.json({ ok: false, reason: 'unconfigured' }, { status: 503 });
  }
  const ok = await recordEat(countryOf(request));
  return NextResponse.json({ ok }, { status: ok ? 200 : 502 });
}

/** The last few, newest first, for the line at the top of the sheet. */
export async function GET() {
  if (!sheetConfigured()) {
    return NextResponse.json({ eats: [] }, { status: 503 });
  }
  return NextResponse.json(
    { eats: await recentEats() },
    { headers: { 'cache-control': 'public, s-maxage=10, stale-while-revalidate=30' } },
  );
}
