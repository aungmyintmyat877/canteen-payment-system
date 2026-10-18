/**
 * Money is stored as BIGINT minor units (cents) in MySQL.
 * Change `CURRENCY` here to switch the whole app to another currency,
 * e.g. { symbol: "Rp", decimals: 0, locale: "id-ID" }.
 */
export const CURRENCY = {
  symbol: "$",
  decimals: 2,
  locale: "en-US",
} as const;

const FACTOR = 10 ** CURRENCY.decimals;

/** Format minor units (e.g. 1250) as "$12.50"; negative → "-$4.50". */
export function formatMoney(minor: number | string | null | undefined): string {
  const n = Number(minor ?? 0);
  const sign = n < 0 ? "-" : "";
  const major = Math.abs(n) / FACTOR;
  return `${sign}${CURRENCY.symbol}${major.toLocaleString(CURRENCY.locale, {
    minimumFractionDigits: CURRENCY.decimals,
    maximumFractionDigits: CURRENCY.decimals,
  })}`;
}

/** Parse a major-unit string ("12.50") into minor units (1250). NaN if invalid. */
export function parseMajorToMinor(input: string): number {
  const trimmed = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return NaN;
  return Math.round(Number(trimmed) * FACTOR);
}
