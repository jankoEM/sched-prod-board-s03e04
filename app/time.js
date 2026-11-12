// R5: incident times in the viewer's own zone and in their locale's order (dd/mm for EU locales).

/**
 * Formats an ISO UTC instant for the viewer. `locale`/`timeZone` default to the viewer's (browser) settings;
 * tests pass them in.
 */
export function formatLocal(iso, { locale, timeZone, seconds = false } = {}) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
  }).format(d);
}
