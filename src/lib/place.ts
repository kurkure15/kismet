const REGION =
  typeof Intl !== 'undefined' && 'DisplayNames' in Intl
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

/** "JP" -> "Japan". Nothing if the code is empty or unknown here. */
export function placeName(code: string | undefined) {
  if (!code) return '';
  try {
    const name = REGION?.of(code);
    return name && name !== code ? name : '';
  } catch {
    return '';
  }
}
