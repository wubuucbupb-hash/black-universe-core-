import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";

import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/components/auth-provider";
import NotFound from "@/pages/not-found";

import Login from "@/pages/login";
import Register from "@/pages/register";
import Dashboard from "@/pages/dashboard";
import SubmitAsset from "@/pages/submit";
import Admin from "@/pages/admin";
import UniverseControlSpace from "@/pages/universe-control-space";
import MatrixEngine from "@/pages/matrix";
import VaultPage from "@/pages/vault";

const queryClient = new QueryClient();

import { useAuth } from "@/components/auth-provider";

function Router() {
  const { user } = useAuth();

  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/register" component={Register} />
      <Route path="/matrix" component={MatrixEngine} />
      <Route path="/vault" component={VaultPage} />

      <Route path="/dashboard">
        {user ? <Dashboard /> : <Login />}
      </Route>

      <Route path="/submit">
        {user ? <SubmitAsset /> : <Login />}
      </Route>

      <Route path="/admin">
        <Admin />
      </Route>

      <Route path="/universe-control-space" component={UniverseControlSpace} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;

const SYSTEM_LABELS: Record<string, string> = {
  "000000000000": "System Core",
  "000000000001": "Reserve Vault",
  "111111111111": "Founder Core",
  "222222222222": "Reserve Pool",
  "333333333333": "Stability Pool",
  "444444444444": "Security Pool",
  "555555555555": "Growth Pool",
  "666666666666": "Real Estate Pool",
  "777777777777": "Debt Pool",
  "888888888888": "Equity Pool",
  "999999999999": "Commodities Pool",
};
const SYSTEM_CORES = Object.keys(SYSTEM_LABELS);

function fmtG(n: number | string) {
  return Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Home() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  const { data: matrixData } = useQuery({
    queryKey: ["home-matrix-accounts"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/matrix/accounts`);
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: 8000,
  });

  const { data: vaultSummary } = useQuery({
    queryKey: ["home-vault-summary"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/custody/summary`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!user,
    refetchInterval: 10000,
  });

  const allAccounts: any[] = matrixData?.accounts ?? [];
  const systemAccounts = allAccounts.filter((a: any) => SYSTEM_CORES.includes(a.accountNumber));
  const citizens = allAccounts.filter((a: any) => !SYSTEM_CORES.includes(a.accountNumber));

  if (user) {
    return (
      <div className="min-h-screen bg-[#050505] text-white">
        {/* Top Nav */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-900 bg-black">
          <span className="text-cyan-400 font-bold font-mono tracking-widest text-sm">🪐 BLACK UNIVERSE</span>
          <div className="flex items-center gap-3">
            <span className="text-zinc-500 text-xs font-mono">
              {user.role === "admin" ? "👑 FOUNDER ROOT" : `👤 ${user.name}`}
            </span>
            <button
              onClick={() => setLocation("/dashboard")}
              className="px-3 py-1 text-[11px] font-bold font-mono bg-cyan-500 hover:bg-cyan-400 text-black rounded"
            >
              DASHBOARD →
            </button>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
          {/* Matrix Engine Widget */}
          <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 bg-black">
              <div className="flex items-center gap-2">
                <span className="text-cyan-400">🌌</span>
                <span className="text-cyan-400 font-bold font-mono text-sm tracking-widest">BLACK UNIVERSE MATRIX ENGINE</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setLocation("/matrix")} className="px-3 py-1 text-[11px] font-bold font-mono bg-cyan-500 hover:bg-cyan-400 text-black rounded">OPEN MATRIX →</button>
                <button onClick={() => setLocation("/vault")} className="px-3 py-1 text-[11px] font-bold font-mono bg-yellow-500 hover:bg-yellow-400 text-black rounded">🏛️ VAULT</button>
                <button onClick={() => setLocation("/dashboard")} className="px-3 py-1 text-[11px] font-bold font-mono bg-zinc-700 hover:bg-zinc-600 text-white rounded">DASHBOARD</button>
              </div>
            </div>

            {/* Stats Row — system-wide counts, admin only */}
            {isAdmin && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-x divide-zinc-800 border-b border-zinc-800">
                {[
                  { label: "SYSTEM POOLS", value: systemAccounts.length, color: "text-cyan-400" },
                  { label: "CITIZENS", value: citizens.length, color: "text-white" },
                  { label: "VAULT LOCKED", value: vaultSummary?.locked ?? "–", color: "text-yellow-400" },
                  { label: "VAULT RELEASED", value: vaultSummary?.released ?? "–", color: "text-emerald-400" },
                ].map((s) => (
                  <div key={s.label} className="p-3 text-center">
                    <div className="text-zinc-600 text-[9px] font-mono tracking-widest">{s.label}</div>
                    <div className={`text-xl font-bold font-mono ${s.color} mt-0.5`}>{s.value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Pool Balances — genesis pools + citizen list, admin only */}
            <div className="p-4">
              {isAdmin && (
                <>
              <div className="text-zinc-600 text-[10px] font-mono tracking-widest mb-3">🔒 GENESIS SYSTEM POOLS — LIVE BALANCES</div>
              {systemAccounts.length === 0 ? (
                <div className="text-zinc-700 text-xs font-mono text-center py-4 animate-pulse">Loading pool data...</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {systemAccounts.map((acc: any) => {
                    const isFounder = acc.accountNumber === "111111111111";
                    const isSystem = acc.accountNumber === "000000000000";
                    const isVault = acc.accountNumber === "000000000001";
                    const border = isFounder
                      ? "border-emerald-500/40 bg-emerald-500/5"
                      : isSystem
                        ? "border-red-500/30 bg-red-500/5"
                        : isVault
                          ? "border-yellow-500/40 bg-yellow-500/5"
                          : "border-zinc-800 bg-zinc-900/50";
                    const labelColor = isFounder
                      ? "text-emerald-400"
                      : isSystem
                        ? "text-red-400"
                        : isVault
                          ? "text-yellow-400"
                          : "text-cyan-500";
                    return (
                      <div key={acc.accountNumber} className={`rounded-lg px-3 py-2 border ${border}`}>
                        <div className={`text-[9px] font-mono font-bold tracking-widest ${labelColor}`}>
                          {acc.type?.toUpperCase()}
                        </div>
                        <div className="text-white text-xs font-semibold truncate mt-0.5">{SYSTEM_LABELS[acc.accountNumber] ?? acc.name}</div>
                        <div className="text-zinc-500 text-[10px] font-mono">{acc.accountNumber}</div>
                        <div className={`text-sm font-bold font-mono mt-1 ${Number(acc.gravityBalance) > 0 ? "text-green-400" : "text-zinc-600"}`}>
                          {isVault ? `₹${fmtG(acc.gravityBalance)}` : `${fmtG(acc.gravityBalance)} G`}
                        </div>
                        {isSystem && (
                          <div className="text-red-400/70 text-[8px] font-mono tracking-widest mt-0.5">TOTAL GRAVITY SUPPLY</div>
                        )}
                        {isVault && (
                          <div className="text-yellow-400/70 text-[8px] font-mono tracking-widest mt-0.5">ASSET BACKING · 200%</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Citizens */}
              {citizens.length > 0 && (
                <div className="mt-4">
                  <div className="text-zinc-600 text-[10px] font-mono tracking-widest mb-2">👥 REGISTERED CITIZENS ({citizens.length})</div>
                  <div className="flex flex-wrap gap-2">
                    {citizens.map((c: any) => (
                      <div key={c.accountNumber} className="border border-cyan-500/20 rounded-md px-3 py-1.5 bg-cyan-500/5">
                        <div className="text-white text-xs font-semibold">{c.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-zinc-500 text-[10px] font-mono">{c.accountNumber}</span>
                          <span className={`text-[11px] font-bold font-mono ${Number(c.gravityBalance) > 0 ? "text-green-400" : "text-zinc-600"}`}>
                            {fmtG(c.gravityBalance)} G
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
                </>
              )}

              {/* Vault Banner */}
              {user && (
                <div
                  onClick={() => setLocation("/vault")}
                  className="cursor-pointer flex items-center justify-between mt-4 p-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 hover:bg-yellow-500/10 transition-all"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🏛️</span>
                    <div>
                      <div className="text-yellow-400 font-bold text-xs font-mono tracking-wide">CUSTODY VAULT STATUS</div>
                      <div className="text-zinc-500 text-[10px] font-mono mt-0.5">
                        {vaultSummary
                          ? `${vaultSummary.locked} Locked · ${vaultSummary.released} Released · ${vaultSummary.total} Total`
                          : "Loading..."}
                      </div>
                    </div>
                  </div>
                  <span className="text-zinc-600 text-[10px] font-mono">Open Vault →</span>
                </div>
              )}
            </div>
          </div>

          {/* Universe Control Space — Minting (admin only) */}
          {isAdmin && (
            <button
              onClick={() => setLocation("/universe-control-space")}
              className="w-full flex items-center justify-between p-4 rounded-xl border border-cyan-500/40 bg-gradient-to-r from-cyan-500/10 to-emerald-500/10 hover:from-cyan-500/20 hover:to-emerald-500/20 transition-all"
              data-testid="button-ucs-home"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">🪙</span>
                <div className="text-left">
                  <div className="text-cyan-300 font-bold text-sm font-mono tracking-widest">UNIVERSE CONTROL SPACE</div>
                  <div className="text-zinc-500 text-[10px] font-mono mt-0.5">Minting · Approve verified assets & issue Gravity</div>
                </div>
              </div>
              <span className="text-cyan-400 text-xs font-mono">Open →</span>
            </button>
          )}

          {/* Quick Actions */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "📊 Dashboard", sub: "Portfolio & Assets", path: "/dashboard", style: "border-zinc-700 hover:border-zinc-500" },
              { label: "🔥 Matrix Engine", sub: "Mint · P2P Transfer", path: "/matrix", style: "border-cyan-500/40 hover:border-cyan-500" },
              { label: "🏛️ Custody Vault", sub: "Lock · Escrow · Release", path: "/vault", style: "border-yellow-500/40 hover:border-yellow-500" },
              ...(isAdmin
                ? [{ label: "🛠️ Admin", sub: "Control Room", path: "/admin", style: "border-zinc-800 hover:border-zinc-600" }]
                : []),
            ].map((btn) => (
              <button
                key={btn.path}
                onClick={() => setLocation(btn.path)}
                className={`p-3 bg-zinc-900 border rounded-lg text-left transition-all ${btn.style}`}
              >
                <div className="text-sm font-bold text-white">{btn.label}</div>
                <div className="text-[10px] text-zinc-500 font-mono mt-0.5">{btn.sub}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-4">
        <h1 className="text-3xl font-bold tracking-wider text-cyan-400 mb-2 text-center">
          🪐 BLACK UNIVERSE
        </h1>
        <p className="text-zinc-500 text-xs font-mono text-center tracking-widest mb-4">SOVEREIGN ASSET VERIFICATION & MATRIX ENGINE</p>

        {/* Live System Pool Preview */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2 border-b border-zinc-800 bg-black flex items-center gap-2">
            <span className="text-cyan-500 text-[10px] font-mono tracking-widest">🌌 LIVE SYSTEM POOLS</span>
            <span className="ml-auto w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          </div>
          <div className="p-3">
            {systemAccounts.length === 0 ? (
              <div className="text-zinc-700 text-xs font-mono text-center py-2 animate-pulse">Connecting to matrix...</div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {systemAccounts.map((acc: any) => {
                  const isFounder = acc.accountNumber === "111111111111";
                  const isVault = acc.accountNumber === "000000000001";
                  return (
                    <div key={acc.accountNumber} className={`rounded px-2 py-1.5 ${isFounder ? "bg-emerald-500/10 border border-emerald-500/20" : isVault ? "bg-yellow-500/10 border border-yellow-500/20" : "bg-zinc-800/50"}`}>
                      <div className="text-[9px] font-mono text-zinc-500 truncate">{SYSTEM_LABELS[acc.accountNumber]}</div>
                      <div className={`text-xs font-bold font-mono ${Number(acc.gravityBalance) > 0 ? "text-green-400" : "text-zinc-600"}`}>
                        {isVault ? `₹${fmtG(acc.gravityBalance)}` : `${fmtG(acc.gravityBalance)} G`}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {citizens.length > 0 && (
              <div className="mt-2 text-center text-zinc-600 text-[10px] font-mono">
                👥 {citizens.length} citizen{citizens.length !== 1 ? "s" : ""} registered
              </div>
            )}
          </div>
        </div>

        {/* Matrix Engine */}
        <div className="p-4 bg-zinc-900 border border-cyan-900 rounded-lg space-y-2">
          <p className="text-[10px] text-cyan-600 font-mono tracking-widest text-center">🌌 SOVEREIGN MATRIX</p>
          <button
            onClick={() => setLocation("/matrix")}
            className="w-full py-3 bg-cyan-500 text-black font-extrabold rounded-md hover:bg-cyan-400 transition-all text-base shadow-lg shadow-cyan-500/25"
          >
            🔥 Matrix Engine
          </button>
          <p className="text-[10px] text-zinc-600 font-mono text-center">Mint · P2P Transfer</p>
        </div>

        {/* Universe Control Space */}
        <div className="p-4 bg-zinc-900 border border-cyan-500/30 rounded-lg space-y-2">
          <p className="text-[10px] text-cyan-600 font-mono tracking-widest text-center">UNIVERSE CONTROL SPACE</p>
          <button
            onClick={() => setLocation("/universe-control-space")}
            className="w-full py-3 bg-cyan-500 text-black font-extrabold rounded-md hover:bg-cyan-400 transition-all text-base shadow-lg shadow-cyan-500/25"
          >
            🪙 Minting
          </button>
        </div>

        {/* Admin */}
        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg space-y-2">
          <p className="text-xs text-zinc-500 font-mono tracking-widest text-center">SYSTEM ARCHITECT</p>
          <button
            onClick={() => setLocation("/admin")}
            className="w-full py-3 bg-transparent border-2 border-cyan-500 text-cyan-400 font-bold rounded-md hover:bg-cyan-950 transition-all text-base"
          >
            🛠️ Admin Control Room
          </button>
        </div>

        {/* Login + Vault row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg space-y-1.5">
            <p className="text-[10px] text-zinc-500 font-mono tracking-widest text-center">CITIZEN LOGIN</p>
            <button
              onClick={() => setLocation("/dashboard")}
              className="w-full py-2.5 bg-zinc-800 text-zinc-300 font-bold rounded-md hover:bg-zinc-700 transition-all text-sm"
            >
              👤 Log In
            </button>
          </div>
          <div className="p-3 bg-zinc-900 border border-yellow-500/30 rounded-lg space-y-1.5">
            <p className="text-[10px] text-yellow-600 font-mono tracking-widest text-center">CUSTODY VAULT</p>
            <button
              onClick={() => setLocation("/vault")}
              className="w-full py-2.5 bg-yellow-500/10 border border-yellow-500/40 text-yellow-400 font-bold rounded-md hover:bg-yellow-500/20 transition-all text-sm"
            >
              🏛️ Open Vault
            </button>
          </div>
        </div>

        {/* Register */}
        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg space-y-2">
          <p className="text-xs text-zinc-500 font-mono tracking-widest text-center">SYSTEM ENTRY</p>
          <button
            onClick={() => setLocation("/register")}
            className="w-full py-3 bg-zinc-900 text-zinc-400 font-bold rounded-md hover:bg-zinc-800 transition-all text-base border border-zinc-700"
          >
            ✨ New Registration
          </button>
        </div>
      </div>
    </div>
  );
}
