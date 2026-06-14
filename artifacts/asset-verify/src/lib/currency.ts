// Universal currency support for the transfer form.
//
// A Black Universe citizen can be from anywhere, so the transfer form must work
// with any world currency — not a fixed shortlist. This module provides:
//   - the full list of ISO-4217 currencies (with symbol + name)
//   - live INR exchange rates (fetched at runtime, cached, offline fallback)
//   - locale/region based default-currency detection for any country
//
// Gravity stays the source of truth: ₹10,000 of local value = 1 Gravity. Every
// other currency converts through its INR value.

export const GRAVITY_RATE = 10000;

// Indicative INR-per-unit rates used as an offline fallback when the live FX
// fetch fails. Live rates (when available) override these.
export const STATIC_INR_PER_UNIT: Record<string, number> = {
  INR: 1, USD: 83, EUR: 90, GBP: 105, AED: 22.6, SGD: 62, AUD: 55, CAD: 61,
  CNY: 11.5, JPY: 0.53, SAR: 22.1, QAR: 22.8, KWD: 270, BHD: 220, OMR: 216,
  CHF: 94, NZD: 51, HKD: 10.6, ZAR: 4.5, RUB: 0.9, BRL: 16.5, MXN: 4.8,
  THB: 2.4, MYR: 18, IDR: 0.0053, PHP: 1.45, KRW: 0.062, TRY: 2.5, NPR: 0.625,
  LKR: 0.28, BDT: 0.7, PKR: 0.3, SEK: 7.9, NOK: 7.7, DKK: 12, PLN: 21,
  CZK: 3.6, HUF: 0.23, ILS: 22, EGP: 1.7, NGN: 0.055, KES: 0.64, TWD: 2.6,
  VND: 0.0034,
};

// ISO-3166 alpha-2 region -> ISO-4217 currency. Comprehensive so a citizen from
// (almost) any country gets their own currency pre-selected. Manual selection
// still covers every currency via the universal list below.
export const COUNTRY_CURRENCY: Record<string, string> = {
  IN: "INR", US: "USD", GB: "GBP", CA: "CAD", AU: "AUD", NZ: "NZD",
  JP: "JPY", CN: "CNY", HK: "HKD", TW: "TWD", KR: "KRW", SG: "SGD",
  MY: "MYR", TH: "THB", ID: "IDR", PH: "PHP", VN: "VND", BD: "BDT",
  PK: "PKR", LK: "LKR", NP: "NPR", BT: "BTN", MM: "MMK", KH: "KHR",
  LA: "LAK", MN: "MNT", MO: "MOP", BN: "BND",
  AE: "AED", SA: "SAR", QA: "QAR", KW: "KWD", BH: "BHD", OM: "OMR",
  JO: "JOD", LB: "LBP", IL: "ILS", IQ: "IQD", IR: "IRR", YE: "YER",
  SY: "SYP", TR: "TRY",
  DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", IE: "EUR",
  PT: "EUR", AT: "EUR", BE: "EUR", FI: "EUR", GR: "EUR", LU: "EUR",
  SK: "EUR", SI: "EUR", EE: "EUR", LV: "EUR", LT: "EUR", CY: "EUR",
  MT: "EUR", HR: "EUR",
  CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", CZ: "CZK",
  HU: "HUF", RO: "RON", BG: "BGN", RS: "RSD", UA: "UAH", RU: "RUB",
  BY: "BYN", IS: "ISK", AL: "ALL", MK: "MKD", BA: "BAM", MD: "MDL",
  GE: "GEL", AM: "AMD", AZ: "AZN", KZ: "KZT", UZ: "UZS", TM: "TMT",
  KG: "KGS", TJ: "TJS",
  ZA: "ZAR", NG: "NGN", KE: "KES", EG: "EGP", MA: "MAD", DZ: "DZD",
  TN: "TND", LY: "LYD", GH: "GHS", ET: "ETB", TZ: "TZS", UG: "UGX",
  RW: "RWF", ZM: "ZMW", ZW: "ZWL", AO: "AOA", MZ: "MZN", BW: "BWP",
  NA: "NAD", MU: "MUR", MG: "MGA", SN: "XOF", CI: "XOF", ML: "XOF",
  BF: "XOF", BJ: "XOF", NE: "XOF", TG: "XOF", CM: "XAF", GA: "XAF",
  CG: "XAF", TD: "XAF", CF: "XAF", GQ: "XAF", SD: "SDG", SS: "SSP",
  SO: "SOS", SL: "SLL", LR: "LRD", GM: "GMD", GN: "GNF", MW: "MWK",
  CD: "CDF",
  BR: "BRL", MX: "MXN", AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN",
  VE: "VES", UY: "UYU", PY: "PYG", BO: "BOB", EC: "USD", GT: "GTQ",
  CR: "CRC", PA: "PAB", DO: "DOP", HN: "HNL", NI: "NIO", SV: "USD",
  JM: "JMD", TT: "TTD", BS: "BSD", BB: "BBD", CU: "CUP",
};

// Build the full universal currency list (code + symbol + display name).
const PRIORITY = ["INR", "USD", "EUR", "GBP", "AED"];

let _displayNames: Intl.DisplayNames | null = null;
try {
  _displayNames = new Intl.DisplayNames(undefined, { type: "currency" });
} catch {
  _displayNames = null;
}

export function currencySymbol(code: string): string {
  for (const display of ["narrowSymbol", "symbol"] as const) {
    try {
      const parts = new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: code,
        currencyDisplay: display,
        maximumFractionDigits: 0,
      }).formatToParts(0);
      const sym = parts.find((p) => p.type === "currency")?.value;
      if (sym) return sym;
    } catch {
      // try next display style
    }
  }
  return code;
}

export function currencyName(code: string): string {
  try {
    return _displayNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

export interface CurrencyOption {
  code: string;
  symbol: string;
  name: string;
}

function allCurrencyCodes(): string[] {
  try {
    const supportedValuesOf = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf;
    if (typeof supportedValuesOf === "function") {
      const codes = supportedValuesOf("currency");
      if (codes && codes.length) return codes;
    }
  } catch {
    // fall through to static derivation
  }
  return Array.from(
    new Set([
      ...Object.values(COUNTRY_CURRENCY),
      ...Object.keys(STATIC_INR_PER_UNIT),
    ]),
  );
}

let _options: CurrencyOption[] | null = null;
export function currencyOptions(): CurrencyOption[] {
  if (_options) return _options;
  const opts = allCurrencyCodes().map((code) => ({
    code,
    symbol: currencySymbol(code),
    name: currencyName(code),
  }));
  opts.sort((a, b) => {
    const pa = PRIORITY.indexOf(a.code);
    const pb = PRIORITY.indexOf(b.code);
    if (pa !== -1 && pb !== -1) return pa - pb;
    if (pa !== -1) return -1;
    if (pb !== -1) return 1;
    return a.code.localeCompare(b.code);
  });
  _options = opts;
  return opts;
}

// Picks the default transfer currency from the browser locale's region; falls
// back to INR when the region is unknown.
export function detectDefaultCurrency(): string {
  try {
    const locales =
      navigator.languages && navigator.languages.length
        ? navigator.languages
        : [navigator.language];
    for (const loc of locales) {
      if (!loc) continue;
      let region: string | undefined;
      try {
        region = new Intl.Locale(loc).maximize().region ?? undefined;
      } catch {
        region = loc.split("-")[1]?.toUpperCase();
      }
      const code = region ? COUNTRY_CURRENCY[region] : undefined;
      if (code) return code;
    }
  } catch {
    // ignore — fall back to INR
  }
  return "INR";
}

// Live FX rates (INR per 1 unit of each currency), cached in localStorage.
const RATES_CACHE_KEY = "bu_fx_inr_per_unit_v1";
const RATES_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function fetchInrPerUnitRates(): Promise<Record<string, number>> {
  try {
    const cached = localStorage.getItem(RATES_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as {
        t: number;
        rates: Record<string, number>;
      };
      if (parsed?.t && Date.now() - parsed.t < RATES_TTL_MS && parsed.rates) {
        return parsed.rates;
      }
    }
  } catch {
    // ignore cache errors and fetch fresh
  }

  const res = await fetch("https://open.er-api.com/v6/latest/INR");
  if (!res.ok) throw new Error(`FX request failed: ${res.status}`);
  const data = (await res.json()) as {
    result?: string;
    rates?: Record<string, number>;
  };
  if (data.result !== "success" || !data.rates) {
    throw new Error("FX response invalid");
  }

  const inrPerUnit: Record<string, number> = { INR: 1 };
  for (const [code, perInr] of Object.entries(data.rates)) {
    if (typeof perInr === "number" && perInr > 0) {
      inrPerUnit[code] = 1 / perInr;
    }
  }

  try {
    localStorage.setItem(
      RATES_CACHE_KEY,
      JSON.stringify({ t: Date.now(), rates: inrPerUnit }),
    );
  } catch {
    // ignore storage errors
  }
  return inrPerUnit;
}
