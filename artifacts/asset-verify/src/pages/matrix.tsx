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

const CLUSTER_OPTIONS = [
  { value: "2", label: "Digit 2 Layer — Citizens" },
  { value: "3", label: "Digit 3 Layer — State" },
  { value: "4", label: "Digit 4 Layer — Nation" },
  { value: "5", label: "Digit 5 Layer — Strategic Partners" },
];

const SYSTEM_CORES = [
  "000000000000", "111111111111",
  "222222222222", "333333333333", "444444444444", "555555555555",
  "666666666666", "777777777777", "888888888888", "999999999999",
];

function fmt(n: number | string) {
  return Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function AccountBadge({ acc }: { acc: any }) {
  const isFounder = acc.accountNumber === "111111111111";
  const isSystem = acc.accountNumber === "000000000000";
  const border = isFounder ? "border-emerald-500" : isSystem ? "border-red-500" : "border-cyan-500/40";
  const typeColor = isFounder ? "text-emerald-400" : isSystem ? "text-red-400" : "text-cyan-400";

  return (
    <div className={`border ${border} rounded-md p-2 mb-2 bg-black/30`}>
      <div className={`text-[10px] font-bold font-mono ${typeColor} uppercase`}>{acc.type}</div>
      <div className="text-white text-sm font-semibold leading-tight">{acc.name}</div>
      <div className="text-zinc-500 text-[11px] font-mono mt-0.5">
        {acc.accountNumber} &nbsp;|&nbsp;{" "}
        <span className="text-green-400 font-bold">{fmt(acc.gravityBalance)} Gravity</span>
      </div>
    </div>
  );
}

export default function MatrixEngine() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();

  const isAdmin = user?.role === "admin";

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: accountsData, isLoading: loadingAccounts } = useQuery({
    queryKey: ["matrix-accounts"],
    queryFn: () => apiFetch("/api/matrix/accounts"),
    refetchInterval: 5000,
  });

  const { data: logsData } = useQuery({
    queryKey: ["matrix-logs"],
    queryFn: () => apiFetch("/api/matrix/logs"),
    refetchInterval: 5000,
  });

  const accounts: any[] = accountsData?.accounts ?? [];
  const logs: any[] = logsData?.logs ?? [];

  const systemAccounts = accounts.filter((a) => SYSTEM_CORES.includes(a.accountNumber));
  const citizens = accounts.filter((a) => !SYSTEM_CORES.includes(a.accountNumber));

  // ── Registration Form ──────────────────────────────────────────────────────
  const [regForm, setRegForm] = useState({ name: "", phone: "", email: "", clusterPrefix: "2" });
  const [regChecks, setRegChecks] = useState({ follow: false, message: false });

  const registerMutation = useMutation({
    mutationFn: (body: object) => apiFetch("/api/matrix/citizens", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (data) => {
      toast({ title: "✅ Identity Verified!", description: `Wallet Created: ${data.account.accountNumber}` });
      setRegForm({ name: "", phone: "", email: "", clusterPrefix: "2" });
      setRegChecks({ follow: false, message: false });
      qc.invalidateQueries({ queryKey: ["matrix-accounts"] });
      qc.invalidateQueries({ queryKey: ["matrix-logs"] });
    },
    onError: (e: Error) => toast({ title: "Registration Failed", description: e.message, variant: "destructive" }),
  });

  function handleRegister() {
    if (!regForm.name.trim() || !regForm.phone.trim()) {
      toast({ title: "Missing Fields", description: "Name and phone are required", variant: "destructive" });
      return;
    }
    if (!regChecks.follow || !regChecks.message) {
      toast({ title: "Gate Refused", description: "Follow + Verification Message rules must be confirmed", variant: "destructive" });
      return;
    }
    registerMutation.mutate({ name: regForm.name, phone: regForm.phone, email: regForm.email, clusterPrefix: regForm.clusterPrefix });
  }

  // ── Mint Form ──────────────────────────────────────────────────────────────
  const [mintForm, setMintForm] = useState({ inrValue: "", assetTitle: "", targetWallet: "" });
  const gravityPreview = Number(mintForm.inrValue) > 0 ? Number(mintForm.inrValue) / 10000 : 0;

  const mintMutation = useMutation({
    mutationFn: (body: object) => apiFetch("/api/matrix/mint", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (data) => {
      toast({ title: "🔥 Mint Complete!", description: `${fmt(data.gravityTotal)} Gravity injected into the matrix` });
      setMintForm({ inrValue: "", assetTitle: "", targetWallet: "" });
      qc.invalidateQueries({ queryKey: ["matrix-accounts"] });
      qc.invalidateQueries({ queryKey: ["matrix-logs"] });
    },
    onError: (e: Error) => toast({ title: "Mint Failed", description: e.message, variant: "destructive" }),
  });

  function handleMint() {
    if (!mintForm.inrValue || Number(mintForm.inrValue) <= 0 || !mintForm.assetTitle.trim() || !mintForm.targetWallet) {
      toast({ title: "Missing Fields", description: "INR value, asset title and target wallet are required", variant: "destructive" });
      return;
    }
    mintMutation.mutate({ inrValue: mintForm.inrValue, assetTitle: mintForm.assetTitle, targetWallet: mintForm.targetWallet });
  }

  // ── Transfer Form ──────────────────────────────────────────────────────────
  const [txForm, setTxForm] = useState({ senderAccount: "", receiverAccount: "", amount: "" });

  const transferMutation = useMutation({
    mutationFn: (body: object) => apiFetch("/api/matrix/transfer", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (data) => {
      toast({ title: "✅ Transfer Successful!", description: `Received: ${fmt(data.received)} Gravity (1% tax: ${fmt(data.tax)})` });
      setTxForm({ senderAccount: "", receiverAccount: "", amount: "" });
      qc.invalidateQueries({ queryKey: ["matrix-accounts"] });
      qc.invalidateQueries({ queryKey: ["matrix-logs"] });
    },
    onError: (e: Error) => toast({ title: "Transfer Failed", description: e.message, variant: "destructive" }),
  });

  function handleTransfer() {
    if (!txForm.senderAccount || !txForm.receiverAccount || !txForm.amount || Number(txForm.amount) <= 0) {
      toast({ title: "Missing Fields", description: "All transfer fields are required", variant: "destructive" });
      return;
    }
    if (txForm.senderAccount === txForm.receiverAccount) {
      toast({ title: "Invalid", description: "Sender and receiver cannot be the same", variant: "destructive" });
      return;
    }
    transferMutation.mutate(txForm);
  }

  const allWallets = accounts.filter((a) => a.accountNumber !== "000000000000");

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
        <button onClick={() => setLocation("/")} className="text-zinc-500 hover:text-cyan-400 text-sm font-mono transition-colors">
          ← BACK
        </button>
        <h1 className="text-cyan-400 font-bold text-lg tracking-widest font-mono">🌌 BLACK UNIVERSE MATRIX ENGINE</h1>
        <div className="text-zinc-600 text-xs font-mono">Sovereign Asset Backing</div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 p-4 max-w-[1400px] mx-auto">
        {/* ── LEFT PANEL ── */}
        <div className="flex-1 space-y-4">

          {/* STEP 1: Citizen Registration */}
          <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-950">
            <h2 className="text-sm font-bold font-mono text-cyan-400 mb-4 tracking-widest">
              👤 STEP 1: LEGAL CITIZEN REGISTRATION PORTAL
            </h2>

            <div className="space-y-3">
              <div>
                <label className="text-zinc-400 text-xs font-mono">Full Name / Enterprise Name *</label>
                <input
                  type="text"
                  placeholder="e.g., Alok Verma"
                  value={regForm.name}
                  onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                  className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400 text-xs font-mono">National ID (Mandatory) *</label>
                  <input
                    type="password"
                    placeholder="Passport / Gov ID"
                    className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                    onChange={() => {}}
                  />
                  <p className="text-zinc-600 text-[10px] mt-1 font-mono">Stored as [Aadhaar Redacted]</p>
                </div>
                <div>
                  <label className="text-zinc-400 text-xs font-mono">Mobile (+Country Code) *</label>
                  <input
                    type="text"
                    placeholder="+91 9876543210"
                    value={regForm.phone}
                    onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                    className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-zinc-400 text-xs font-mono">Email (Optional)</label>
                <input
                  type="email"
                  placeholder="info@domain.com"
                  value={regForm.email}
                  onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                  className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-zinc-400 text-xs font-mono">Network Cluster</label>
                <select
                  value={regForm.clusterPrefix}
                  onChange={(e) => setRegForm({ ...regForm, clusterPrefix: e.target.value })}
                  className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                >
                  {CLUSTER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={regChecks.follow}
                    onChange={(e) => setRegChecks({ ...regChecks, follow: e.target.checked })}
                    className="accent-cyan-400"
                  />
                  <span className="text-zinc-300 text-sm">Rule 1: Official Page Followed</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={regChecks.message}
                    onChange={(e) => setRegChecks({ ...regChecks, message: e.target.checked })}
                    className="accent-cyan-400"
                  />
                  <span className="text-zinc-300 text-sm">Rule 2: Verification Message Sent</span>
                </label>
              </div>

              <button
                onClick={handleRegister}
                disabled={registerMutation.isPending}
                className="w-full py-3 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black font-extrabold rounded-md transition-all text-sm tracking-wide shadow-lg shadow-cyan-500/20"
              >
                {registerMutation.isPending ? "⏳ PROCESSING..." : "🚀 VALIDATE AND INITIALIZE SOVEREIGN ID"}
              </button>
            </div>
          </div>

          {/* STEP 2: System Mint */}
          <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-950">
            <h2 className="text-sm font-bold font-mono text-cyan-400 mb-1 tracking-widest">
              📥 STEP 2: SYSTEM MINT & SOVEREIGN ROUTING
            </h2>
            {!isAdmin ? (
              <div className="mt-4 p-3 border border-yellow-500/30 rounded-md bg-yellow-500/5 text-yellow-400 text-sm font-mono">
                🔒 FOUNDER ROOT ACCESS REQUIRED — This module is locked to Account 111111111111
              </div>
            ) : (
              <div className="space-y-3 mt-4">
                <div>
                  <label className="text-zinc-400 text-xs font-mono">Target Wallet (Growth Recipient) *</label>
                  <select
                    value={mintForm.targetWallet}
                    onChange={(e) => setMintForm({ ...mintForm, targetWallet: e.target.value })}
                    className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="">— Select Wallet —</option>
                    {allWallets.map((a) => (
                      <option key={a.accountNumber} value={a.accountNumber}>
                        {a.name} ({a.accountNumber})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-zinc-400 text-xs font-mono">Asset Document Registry Info *</label>
                  <input
                    type="text"
                    placeholder="e.g., Plot No 42, 500 Sq Yards Certificate"
                    value={mintForm.assetTitle}
                    onChange={(e) => setMintForm({ ...mintForm, assetTitle: e.target.value })}
                    className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-zinc-400 text-xs font-mono">Asset Valuation in INR (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    step="10000"
                    placeholder="e.g., 5000000"
                    value={mintForm.inrValue}
                    onChange={(e) => setMintForm({ ...mintForm, inrValue: e.target.value })}
                    className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                  />
                  {gravityPreview > 0 && (
                    <p className="text-cyan-400 text-xs mt-1 font-mono">
                      ✨ Liquidity Expansion: {fmt(gravityPreview)} Gravity Notes
                    </p>
                  )}
                </div>

                {gravityPreview > 0 && (
                  <div className="bg-black/50 border border-zinc-800 rounded-md p-3 text-[11px] font-mono space-y-1">
                    <div className="text-zinc-400">Split Preview:</div>
                    <div className="text-emerald-400">👑 Founder (1%): {fmt(gravityPreview * 0.01)}</div>
                    <div className="text-cyan-400">🏛️ Reserve (24%): {fmt(gravityPreview * 0.24)}</div>
                    <div className="text-cyan-400">⚖️ Stability (25%): {fmt(gravityPreview * 0.25)}</div>
                    <div className="text-cyan-400">🛡️ Security (25%): {fmt(gravityPreview * 0.25)}</div>
                    <div className="text-green-400">📈 Growth → Target (25%): {fmt(gravityPreview * 0.25)}</div>
                  </div>
                )}

                <button
                  onClick={handleMint}
                  disabled={mintMutation.isPending}
                  className="w-full py-3 bg-gradient-to-r from-cyan-600 to-cyan-400 hover:from-cyan-500 hover:to-cyan-300 disabled:opacity-50 text-black font-extrabold rounded-md transition-all text-sm tracking-wide"
                >
                  {mintMutation.isPending ? "⏳ EXECUTING..." : "🔥 EXECUTE SYSTEM MINT & SPLIT PIPELINE"}
                </button>
              </div>
            )}
          </div>

          {/* STEP 3: P2P Transfer */}
          <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-950">
            <h2 className="text-sm font-bold font-mono text-cyan-400 mb-4 tracking-widest">
              💸 STEP 3: P2P SOVEREIGN TRANSFER
            </h2>

            {!user ? (
              <div className="p-3 border border-zinc-700 rounded-md text-zinc-500 text-sm font-mono">
                Login required for P2P transfers
              </div>
            ) : citizens.length === 0 ? (
              <div className="p-3 border border-zinc-700 rounded-md text-zinc-500 text-sm font-mono">
                Register at least one citizen first
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-zinc-400 text-xs font-mono">Sender Account</label>
                  <select
                    value={txForm.senderAccount}
                    onChange={(e) => setTxForm({ ...txForm, senderAccount: e.target.value })}
                    className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="">— Select Sender —</option>
                    {allWallets.map((a) => (
                      <option key={a.accountNumber} value={a.accountNumber}>
                        {a.name} ({a.accountNumber}) [Bal: {fmt(a.gravityBalance)}]
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-zinc-400 text-xs font-mono">Receiver Account</label>
                  <select
                    value={txForm.receiverAccount}
                    onChange={(e) => setTxForm({ ...txForm, receiverAccount: e.target.value })}
                    className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="">— Select Receiver —</option>
                    {allWallets.map((a) => (
                      <option key={a.accountNumber} value={a.accountNumber}>
                        {a.name} ({a.accountNumber})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-zinc-400 text-xs font-mono">Amount (Gravity)</label>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    placeholder="0.00"
                    value={txForm.amount}
                    onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })}
                    className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                  />
                  {Number(txForm.amount) > 0 && (
                    <p className="text-zinc-500 text-[11px] mt-1 font-mono">
                      Receiver gets {fmt(Number(txForm.amount) * 0.99)} | Tax: {fmt(Number(txForm.amount) * 0.01)} → Founder
                    </p>
                  )}
                </div>

                <button
                  onClick={handleTransfer}
                  disabled={transferMutation.isPending}
                  className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white font-bold rounded-md transition-all text-sm border border-zinc-600"
                >
                  {transferMutation.isPending ? "⏳ PROCESSING..." : "🛡️ EXECUTE SECURE TRANSFER"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL: LIVE MATRIX LEDGER ── */}
        <div className="lg:w-[420px]">
          <div className="bg-[#0F172A] border border-zinc-700/50 rounded-xl p-4 sticky top-4 font-mono">
            <h2 className="text-cyan-400 font-bold text-sm tracking-widest mb-3">⚙️ REAL-TIME MATRIX LEDGER</h2>

            <div className="border-t border-zinc-700/50 pt-3 mb-3">
              <div className="text-zinc-500 text-[10px] font-bold tracking-widest mb-2">🔒 GENESIS SYSTEM CORES</div>
              {loadingAccounts ? (
                <div className="text-zinc-600 text-xs">Loading...</div>
              ) : (
                systemAccounts.map((acc) => <AccountBadge key={acc.accountNumber} acc={acc} />)
              )}
            </div>

            <div className="border-t border-zinc-700/50 pt-3 mb-3">
              <div className="text-zinc-500 text-[10px] font-bold tracking-widest mb-2">
                👥 REGISTERED CITIZENS ({citizens.length})
              </div>
              {citizens.length === 0 ? (
                <div className="text-zinc-600 text-xs">No citizens registered yet</div>
              ) : (
                citizens.map((acc) => (
                  <div key={acc.accountNumber} className="border-l-2 border-cyan-500 pl-3 mb-2">
                    <div className="text-white text-sm font-semibold">{acc.name}</div>
                    <div className="text-zinc-500 text-[11px]">{acc.accountNumber}</div>
                    <div className="text-green-400 text-sm font-bold">{fmt(acc.gravityBalance)} Gravity</div>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-zinc-700/50 pt-3">
              <div className="text-zinc-500 text-[10px] font-bold tracking-widest mb-2">📜 ENGINE LOG MATRIX</div>
              <div className="bg-[#020617] border border-zinc-800 rounded-md p-2 max-h-48 overflow-y-auto space-y-1">
                {logs.length === 0 ? (
                  <div className="text-zinc-600 text-[11px]">⚙️ [SYSTEM] Matrix Engine Active</div>
                ) : (
                  logs.map((log) => (
                    <div key={log.id} className="text-[11px] text-cyan-300/70 leading-snug">
                      {log.description}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
