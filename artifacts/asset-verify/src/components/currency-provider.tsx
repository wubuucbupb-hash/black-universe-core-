import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  GRAVITY_RATE,
  STATIC_INR_PER_UNIT,
  currencyOptions,
  currencySymbol,
  fetchInrPerUnitRates,
  type CurrencyOption,
} from "@/lib/currency";

// Gravity is the canonical unit — everything is counted in Gravity. This
// provider lets each user pick a display currency (Gravity by default, or any
// world currency) and converts Gravity → that currency for display only.
// 1 Gravity = ₹GRAVITY_RATE; other currencies convert through their INR value.
export const GRAVITY = "GRAVITY";
const STORAGE_KEY = "bu_display_currency";

interface CurrencyContextValue {
  code: string;
  setCode: (code: string) => void;
  rates: Record<string, number>;
  options: CurrencyOption[];
  format: (gravity: number | string) => string;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

function fmtNum(n: number): string {
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [code, setCodeState] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || GRAVITY;
    } catch {
      return GRAVITY;
    }
  });
  const [rates, setRates] = useState<Record<string, number>>(
    STATIC_INR_PER_UNIT,
  );

  useEffect(() => {
    let active = true;
    fetchInrPerUnitRates()
      .then((r) => {
        if (active) setRates(r);
      })
      .catch(() => {
        // keep the static offline fallback
      });
    return () => {
      active = false;
    };
  }, []);

  function setCode(next: string) {
    setCodeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore storage errors
    }
  }

  function format(gravity: number | string): string {
    const g = Number(gravity) || 0;
    if (code === GRAVITY) return `${fmtNum(g)} G`;
    const rate = rates[code] ?? STATIC_INR_PER_UNIT[code] ?? 1;
    const value = (g * GRAVITY_RATE) / rate;
    return `${currencySymbol(code)}${fmtNum(value)}`;
  }

  const options = currencyOptions();

  return (
    <CurrencyContext.Provider value={{ code, setCode, rates, options, format }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) {
    throw new Error("useCurrency must be used within a CurrencyProvider");
  }
  return ctx;
}

export function CurrencySelect({ className }: { className?: string }) {
  const { code, setCode, options } = useCurrency();
  return (
    <select
      value={code}
      onChange={(e) => setCode(e.target.value)}
      className={
        className ??
        "bg-black border border-zinc-700 text-zinc-300 text-[11px] font-mono rounded px-2 py-1 focus:border-cyan-500 focus:outline-none"
      }
      data-testid="select-display-currency"
      aria-label="Display currency"
    >
      <option value={GRAVITY}>🌌 Gravity (G)</option>
      {options.map((o) => (
        <option key={o.code} value={o.code}>
          {o.symbol} {o.code} — {o.name}
        </option>
      ))}
    </select>
  );
}
