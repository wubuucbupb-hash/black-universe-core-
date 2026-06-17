import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth-provider";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function fmt(n: number | string) {
  return Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

const STATUS_COLORS: Record<string, string> = {
  LOCKED: "text-yellow-400 border-yellow-500/40 bg-yellow-500/5",
  PENDING: "text-zinc-400 border-zinc-500/40 bg-zinc-500/5",
  RELEASED: "text-emerald-400 border-emerald-500/40 bg-emerald-500/5",
};

const STATUS_ICONS: Record<string, string> = {
  LOCKED: "🔒",
  PENDING: "⏳",
  RELEASED: "✅",
};

export default function VaultPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [escrowForm, setEscrowForm] = useState({ senderAccount: "", receiverAccount: "", amount: "", description: "" });
  const [lockForm, setLockForm] = useState({ ownerAccount: "", assetType: "", valuation: "", description: "" });

  const isAdmin = user?.role === "admin";

  const { data: summaryData } = useQuery({
    queryKey: ["custody-summary"],
    queryFn: () => apiFetch("/api/custody/summary"),
    enabled: !!user,
    refetchInterval: 5000,
  });

  const { data: vaultData, isLoading: vaultLoading } = useQuery({
    queryKey: ["custody-vault"],
    queryFn: () => apiFetch("/api/custody/vault"),
    enabled: !!isAdmin,
    refetchInterval: 5000,
  });

  const { data: accountsData } = useQuery({
    queryKey: ["matrix-accounts"],
    queryFn: () => apiFetch("/api/matrix/accounts"),
    enabled: !!user,
  });

  const accounts: any[] = accountsData?.accounts ?? [];
  const summary = summaryData ?? { total: 0, locked: 0, pending: 0, released: 0, totalLockedValue: 0 };
  const entries: any[] = vaultData?.entries ?? [];

  const releaseMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/custody/release/${id}`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "✅ Escrow Released!", description: "Funds transferred to receiver" });
      qc.invalidateQueries({ queryKey: ["custody-vault"] });
      qc.invalidateQueries({ queryKey: ["custody-summary"] });
      qc.invalidateQueries({ queryKey: ["matrix-accounts"] });
      qc.invalidateQueries({ queryKey: ["matrix-logs"] });
    },
    onError: (e: Error) => toast({ title: "Release Failed", description: e.message, variant: "destructive" }),
  });

  const escrowMutation = useMutation({
    mutationFn: (body: object) => apiFetch("/api/custody/escrow", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (data) => {
      toast({ title: "🔒 Funds Locked in Escrow", description: `Custody ID: ${data.custodyId} — Awaiting Founder release` });
      setEscrowForm({ senderAccount: "", receiverAccount: "", amount: "", description: "" });
      qc.invalidateQueries({ queryKey: ["custody-summary"] });
      qc.invalidateQueries({ queryKey: ["custody-vault"] });
      qc.invalidateQueries({ queryKey: ["matrix-accounts"] });
    },
    onError: (e: Error) => toast({ title: "Escrow Failed", description: e.message, variant: "destructive" }),
  });

  const lockMutation = useMutation({
    mutationFn: (body: object) => apiFetch("/api/custody/lock", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: "🔒 Asset Locked in Vault", description: "Asset custody entry created" });
      setLockForm({ ownerAccount: "", assetType: "", valuation: "", description: "" });
      qc.invalidateQueries({ queryKey: ["custody-summary"] });
      qc.invalidateQueries({ queryKey: ["custody-vault"] });
    },
    onError: (e: Error) => toast({ title: "Lock Failed", description: e.message, variant: "destructive" }),
  });

  if (!user) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">🔐</div>
          <p className="text-zinc-400 font-mono">Login required to access Custody Vault</p>
          <button onClick={() => setLocation("/")} className="mt-4 text-cyan-400 hover:text-cyan-300 text-sm font-mono underline">
            ← Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
        <button onClick={() => setLocation("/dashboard")} className="text-zinc-500 hover:text-cyan-400 text-sm font-mono transition-colors">
          ← DASHBOARD
        </button>
        <h1 className="text-cyan-400 font-bold text-lg tracking-widest font-mono">🏛️ CUSTODY VAULT</h1>
        <div className="text-zinc-600 text-xs font-mono">Black Universe</div>
      </div>

      <div className="max-w-[1200px] mx-auto p-4 space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "TOTAL ENTRIES", value: summary.total, color: "text-zinc-300" },
            { label: "🔒 LOCKED", value: summary.locked, color: "text-yellow-400" },
            { label: "⏳ PENDING", value: summary.pending, color: "text-zinc-400" },
            { label: "✅ RELEASED", value: summary.released, color: "text-emerald-400" },
          ].map((s) => (
            <div key={s.label} className="border border-zinc-800 rounded-xl p-4 bg-zinc-950 text-center">
              <div className="text-zinc-600 text-[10px] font-mono tracking-widest mb-1">{s.label}</div>
              <div className={`text-3xl font-bold font-mono ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Total Locked Value */}
        <div className="border border-yellow-500/30 rounded-xl p-4 bg-yellow-500/5 flex items-center justify-between">
          <div>
            <div className="text-yellow-500 text-[10px] font-mono tracking-widest">TOTAL LOCKED GRAVITY VALUE</div>
            <div className="text-yellow-400 text-2xl font-bold font-mono mt-1">{fmt(summary.totalLockedValue)} Gravity</div>
          </div>
          <div className="text-4xl opacity-40">🔒</div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* LEFT: Actions */}
          <div className="space-y-4">

            {/* Escrow Transfer */}
            <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-950">
              <h2 className="text-xs font-bold font-mono text-cyan-400 tracking-widest mb-4">
                🔒 INITIATE P2P ESCROW TRANSFER
              </h2>
              <p className="text-zinc-600 text-[11px] font-mono mb-4">
                Funds deducted from sender immediately and locked. Founder must release to credit receiver.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-zinc-400 text-xs font-mono">Sender Account</label>
                  <select value={escrowForm.senderAccount} onChange={(e) => setEscrowForm({ ...escrowForm, senderAccount: e.target.value })}
                    className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none">
                    <option value="">— Select Sender —</option>
                    {accounts.filter(a => a.accountNumber !== "000000000000" && a.accountNumber !== "000000000001").map(a => (
                      <option key={a.accountNumber} value={a.accountNumber}>
                        {a.name} ({a.accountNumber}) [{fmt(a.gravityBalance)} G]
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-zinc-400 text-xs font-mono">Receiver Account</label>
                  <select value={escrowForm.receiverAccount} onChange={(e) => setEscrowForm({ ...escrowForm, receiverAccount: e.target.value })}
                    className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none">
                    <option value="">— Select Receiver —</option>
                    {accounts.filter(a => a.accountNumber !== "000000000000" && a.accountNumber !== "000000000001").map(a => (
                      <option key={a.accountNumber} value={a.accountNumber}>
                        {a.name} ({a.accountNumber})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-zinc-400 text-xs font-mono">Amount (Gravity)</label>
                  <input type="number" min="0" step="0.0001" placeholder="0.0000" value={escrowForm.amount}
                    onChange={(e) => setEscrowForm({ ...escrowForm, amount: e.target.value })}
                    className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none" />
                </div>
                <div>
                  <label className="text-zinc-400 text-xs font-mono">Description (Optional)</label>
                  <input type="text" placeholder="Transfer purpose..." value={escrowForm.description}
                    onChange={(e) => setEscrowForm({ ...escrowForm, description: e.target.value })}
                    className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none" />
                </div>
                <button onClick={() => escrowMutation.mutate(escrowForm)} disabled={escrowMutation.isPending}
                  className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-extrabold rounded-md transition-all text-sm tracking-wide">
                  {escrowMutation.isPending ? "⏳ LOCKING..." : "🔒 LOCK IN ESCROW"}
                </button>
              </div>
            </div>

            {/* Manual Asset Lock */}
            <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-950">
              <h2 className="text-xs font-bold font-mono text-cyan-400 tracking-widest mb-4">
                🏦 MANUAL ASSET CUSTODY LOCK
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="text-zinc-400 text-xs font-mono">Owner Account</label>
                  <select value={lockForm.ownerAccount} onChange={(e) => setLockForm({ ...lockForm, ownerAccount: e.target.value })}
                    className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none">
                    <option value="">— Select Account —</option>
                    {accounts.map(a => (
                      <option key={a.accountNumber} value={a.accountNumber}>{a.name} ({a.accountNumber})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-zinc-400 text-xs font-mono">Asset Type</label>
                  <input type="text" placeholder="e.g., Real Estate, Gold, Securities" value={lockForm.assetType}
                    onChange={(e) => setLockForm({ ...lockForm, assetType: e.target.value })}
                    className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none" />
                </div>
                <div>
                  <label className="text-zinc-400 text-xs font-mono">Valuation (₹ INR)</label>
                  <input type="number" min="0" placeholder="0.00" value={lockForm.valuation}
                    onChange={(e) => setLockForm({ ...lockForm, valuation: e.target.value })}
                    className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none" />
                </div>
                <div>
                  <label className="text-zinc-400 text-xs font-mono">Description (Encrypted in DB)</label>
                  <textarea placeholder="Asset details, certificate numbers..." value={lockForm.description}
                    onChange={(e) => setLockForm({ ...lockForm, description: e.target.value })} rows={2}
                    className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none resize-none" />
                </div>
                <button onClick={() => lockMutation.mutate(lockForm)} disabled={lockMutation.isPending}
                  className="w-full py-3 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white font-bold rounded-md transition-all text-sm">
                  {lockMutation.isPending ? "⏳ LOCKING..." : "🏦 LOCK ASSET IN VAULT"}
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT: Vault Entries (Founder only) */}
          <div className="border border-zinc-800 rounded-xl bg-zinc-950 overflow-hidden">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-xs font-bold font-mono text-cyan-400 tracking-widest">
                📋 VAULT LEDGER
              </h2>
              {!isAdmin && (
                <span className="text-[10px] font-mono text-yellow-500 border border-yellow-500/30 px-2 py-0.5 rounded">
                  🔒 FOUNDER ACCESS ONLY
                </span>
              )}
            </div>

            {!isAdmin ? (
              <div className="p-8 text-center">
                <div className="text-4xl mb-3">👑</div>
                <p className="text-zinc-500 font-mono text-sm">Full vault data is restricted to</p>
                <p className="text-cyan-400 font-mono text-sm font-bold">Founder Root (111111111111)</p>
                <p className="text-zinc-600 font-mono text-xs mt-2">You can see summary counts above</p>
              </div>
            ) : vaultLoading ? (
              <div className="p-8 text-center text-zinc-600 font-mono text-sm">Loading vault...</div>
            ) : entries.length === 0 ? (
              <div className="p-8 text-center text-zinc-600 font-mono text-sm">No custody entries yet</div>
            ) : (
              <div className="divide-y divide-zinc-800/50 max-h-[600px] overflow-y-auto">
                {entries.map((e) => (
                  <div key={e.id} className={`p-4 border-l-2 ${e.status === "LOCKED" ? "border-l-yellow-500" : e.status === "RELEASED" ? "border-l-emerald-500" : "border-l-zinc-600"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded border ${STATUS_COLORS[e.status] ?? ""}`}>
                            {STATUS_ICONS[e.status]} {e.status}
                          </span>
                          <span className="text-zinc-500 text-[10px] font-mono">{e.assetType}</span>
                        </div>
                        <div className="text-white text-sm font-semibold truncate">{e.description}</div>
                        <div className="text-cyan-400 text-xs font-mono mt-0.5">₹ {fmt(e.valuation)}</div>
                        {e.escrowFromAccount && (
                          <div className="text-zinc-500 text-[10px] font-mono mt-1">
                            {e.escrowFromAccount} → {e.escrowToAccount}
                            {e.escrowAmount && ` · ${fmt(e.escrowAmount)} Gravity`}
                          </div>
                        )}
                        <div className="text-zinc-700 text-[10px] font-mono mt-0.5">
                          Owner: {e.ownerAccount} · #{e.id}
                        </div>
                      </div>
                      {e.status === "LOCKED" && isAdmin && (
                        <button
                          onClick={() => releaseMutation.mutate(e.id)}
                          disabled={releaseMutation.isPending}
                          className="shrink-0 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black text-xs font-bold rounded-md transition-all"
                        >
                          {releaseMutation.isPending ? "..." : "🔓 RELEASE"}
                        </button>
                      )}
                    </div>
                    {e.releasedAt && (
                      <div className="text-emerald-600 text-[10px] font-mono mt-1">
                        Released: {new Date(e.releasedAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
