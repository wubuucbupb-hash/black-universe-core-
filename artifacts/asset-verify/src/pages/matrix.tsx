import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth-provider";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  useListMyAssets,
  getListMyAssetsQueryKey,
} from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ₹10,000 of local currency = 1 Gravity (matches the system mint pipeline).
const GRAVITY_RATE = 10000;

// Local-currency options for the transfer form. `inrPerUnit` = how many INR
// equal one unit of the currency. Gravity stays anchored at ₹10,000 = 1 Gravity,
// so every other currency converts through its INR value. Rates are indicative.
const CURRENCIES = [
  { code: "INR", symbol: "₹", label: "Indian Rupee", inrPerUnit: 1 },
  { code: "USD", symbol: "$", label: "US Dollar", inrPerUnit: 83 },
  { code: "EUR", symbol: "€", label: "Euro", inrPerUnit: 90 },
  { code: "GBP", symbol: "£", label: "British Pound", inrPerUnit: 105 },
  { code: "AED", symbol: "د.إ", label: "UAE Dirham", inrPerUnit: 22.6 },
  { code: "SGD", symbol: "S$", label: "Singapore Dollar", inrPerUnit: 62 },
  { code: "AUD", symbol: "A$", label: "Australian Dollar", inrPerUnit: 55 },
  { code: "CAD", symbol: "C$", label: "Canadian Dollar", inrPerUnit: 61 },
  { code: "CNY", symbol: "¥", label: "Chinese Yuan", inrPerUnit: 11.5 },
  { code: "JPY", symbol: "¥", label: "Japanese Yen", inrPerUnit: 0.53 },
] as const;

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
  return Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDate(d: string) {
  try {
    return new Date(d).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return d;
  }
}

export default function MatrixEngine() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();

  const isAdmin = user?.role === "admin";

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: accountsData } = useQuery({
    queryKey: ["matrix-accounts"],
    queryFn: () => apiFetch("/api/matrix/accounts"),
    refetchInterval: 5000,
  });

  const accounts: any[] = accountsData?.accounts ?? [];
  const myAccount = accounts.find(
    (a) => a.accountNumber === user?.accountNumber,
  );
  // Selectable transfer counterparties (exclude the System Core sink).
  const allWallets = accounts.filter((a) => a.accountNumber !== "000000000000");

  // The logged-in user's own transaction history.
  const { data: txData } = useQuery({
    queryKey: ["my-transactions"],
    queryFn: () => apiFetch("/api/matrix/my-transactions"),
    enabled: !!user,
    refetchInterval: 5000,
  });
  const myTxns: any[] = txData?.transactions ?? [];

  // The logged-in user's approved asset declarations.
  const { data: myAssetsData } = useListMyAssets({
    query: { queryKey: getListMyAssetsQueryKey(), enabled: !!user },
  });
  const approvedAssets = (myAssetsData ?? []).filter(
    (a) => a.status === "approved",
  );

  // ── Mint Form (Founder only) ────────────────────────────────────────────────
  const [mintForm, setMintForm] = useState({ inrValue: "", assetTitle: "" });
  const gravityPreview =
    Number(mintForm.inrValue) > 0 ? Number(mintForm.inrValue) / 10000 : 0;

  const mintMutation = useMutation({
    mutationFn: (body: object) =>
      apiFetch("/api/matrix/mint", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (data) => {
      toast({
        title: "🔥 Mint Complete!",
        description: `${fmt(data.gravityTotal)} Gravity injected into the matrix`,
      });
      setMintForm({ inrValue: "", assetTitle: "" });
      qc.invalidateQueries({ queryKey: ["matrix-accounts"] });
    },
    onError: (e: Error) =>
      toast({ title: "Mint Failed", description: e.message, variant: "destructive" }),
  });

  function handleMint() {
    if (
      !mintForm.inrValue ||
      Number(mintForm.inrValue) <= 0 ||
      !mintForm.assetTitle.trim()
    ) {
      toast({
        title: "Missing Fields",
        description: "Asset valuation and document info are required",
        variant: "destructive",
      });
      return;
    }
    mintMutation.mutate({
      inrValue: mintForm.inrValue,
      assetTitle: mintForm.assetTitle,
    });
  }

  // ── Transfer Form ───────────────────────────────────────────────────────────
  const [txForm, setTxForm] = useState({
    senderAccount: "",
    receiverAccount: "",
    amount: "",
  });
  // Local currency is a convenience input; Gravity (txForm.amount) stays the
  // source of truth. `currencyCode` picks which currency the input is in.
  const [inrAmount, setInrAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState("INR");
  const selectedCurrency =
    CURRENCIES.find((c) => c.code === currencyCode) ?? CURRENCIES[0];
  const fxRate = selectedCurrency.inrPerUnit;

  const transferMutation = useMutation({
    mutationFn: (body: object) =>
      apiFetch("/api/matrix/transfer", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      toast({
        title: "✅ Transfer Successful!",
        description:
          `Receiver got full ${fmt(data.received)} Gravity · 1% charge ${fmt(data.charge)} deducted separately` +
          (data.overage > 0
            ? ` · ⚠️ Wallet overage: -${fmt(data.overage)}`
            : ""),
      });
      setTxForm({ senderAccount: "", receiverAccount: "", amount: "" });
      setInrAmount("");
      qc.invalidateQueries({ queryKey: ["matrix-accounts"] });
      qc.invalidateQueries({ queryKey: ["my-transactions"] });
    },
    onError: (e: Error) =>
      toast({ title: "Transfer Failed", description: e.message, variant: "destructive" }),
  });

  function handleTransfer() {
    const sender = isAdmin ? txForm.senderAccount : (user?.accountNumber ?? "");
    if (
      !sender ||
      !txForm.receiverAccount ||
      !txForm.amount ||
      Number(txForm.amount) <= 0
    ) {
      toast({
        title: "Missing Fields",
        description: isAdmin
          ? "All transfer fields are required"
          : "Receiver and amount are required",
        variant: "destructive",
      });
      return;
    }
    if (sender === txForm.receiverAccount) {
      toast({
        title: "Invalid",
        description: "Sender and receiver cannot be the same",
        variant: "destructive",
      });
      return;
    }
    const body = isAdmin
      ? {
          senderAccount: sender,
          receiverAccount: txForm.receiverAccount,
          amount: txForm.amount,
        }
      : { receiverAccount: txForm.receiverAccount, amount: txForm.amount };
    transferMutation.mutate(body);
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => setLocation("/")}
          className="text-zinc-500 hover:text-cyan-400 text-sm font-mono transition-colors"
        >
          ← BACK
        </button>
        <h1 className="text-cyan-400 font-bold text-lg tracking-widest font-mono">
          🌌 BLACK UNIVERSE MATRIX ENGINE
        </h1>
        <div className="text-zinc-600 text-xs font-mono">
          Sovereign Asset Backing
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 p-4 max-w-[1400px] mx-auto">
        {/* ── LEFT PANEL ── */}
        <div className="flex-1 space-y-4">
          {/* Founder Mint — admin only */}
          {isAdmin && (
            <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-950">
              <h2 className="text-sm font-bold font-mono text-cyan-400 mb-1 tracking-widest">
                📥 SYSTEM MINT &amp; SOVEREIGN ROUTING
              </h2>
              <div className="space-y-3 mt-4">
                <div>
                  <label className="text-zinc-400 text-xs font-mono">
                    Asset Document Registry Info *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Plot No 42, 500 Sq Yards Certificate"
                    value={mintForm.assetTitle}
                    onChange={(e) =>
                      setMintForm({ ...mintForm, assetTitle: e.target.value })
                    }
                    className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-zinc-400 text-xs font-mono">
                    Asset Valuation in INR (₹) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="10000"
                    placeholder="e.g., 5000000"
                    value={mintForm.inrValue}
                    onChange={(e) =>
                      setMintForm({ ...mintForm, inrValue: e.target.value })
                    }
                    className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                  />
                  {gravityPreview > 0 && (
                    <p className="text-cyan-400 text-xs mt-1 font-mono">
                      ✨ Liquidity Expansion: {fmt(gravityPreview)} Gravity Notes
                    </p>
                  )}
                </div>

                <button
                  onClick={handleMint}
                  disabled={mintMutation.isPending}
                  className="w-full py-3 bg-gradient-to-r from-cyan-600 to-cyan-400 hover:from-cyan-500 hover:to-cyan-300 disabled:opacity-50 text-black font-extrabold rounded-md transition-all text-sm tracking-wide"
                >
                  {mintMutation.isPending
                    ? "⏳ EXECUTING..."
                    : "🔥 EXECUTE SYSTEM MINT & SPLIT PIPELINE"}
                </button>
              </div>
            </div>
          )}

          {/* P2P Sovereign Transfer */}
          <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-950">
            <h2 className="text-sm font-bold font-mono text-cyan-400 mb-4 tracking-widest">
              💸 P2P SOVEREIGN TRANSFER
            </h2>

            {!user ? (
              <div className="p-3 border border-zinc-700 rounded-md text-zinc-500 text-sm font-mono">
                Login required for P2P transfers
              </div>
            ) : (
              <div className="space-y-3">
                {/* Sender */}
                {isAdmin ? (
                  <div>
                    <label className="text-zinc-400 text-xs font-mono">
                      Sender Account
                    </label>
                    <select
                      value={txForm.senderAccount}
                      onChange={(e) =>
                        setTxForm({ ...txForm, senderAccount: e.target.value })
                      }
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
                ) : (
                  <div>
                    <label className="text-zinc-400 text-xs font-mono">
                      Your Wallet
                    </label>
                    <div className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2 text-white text-sm font-mono">
                      {myAccount ? (
                        <>
                          {myAccount.name} ({myAccount.accountNumber}){" "}
                          <span className="text-green-400">
                            [Bal: {fmt(myAccount.gravityBalance)}]
                          </span>
                        </>
                      ) : (
                        <span className="text-zinc-500">
                          No wallet linked to your account
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Receiver */}
                <div>
                  <label className="text-zinc-400 text-xs font-mono">
                    Receiver Account
                  </label>
                  <select
                    value={txForm.receiverAccount}
                    onChange={(e) =>
                      setTxForm({ ...txForm, receiverAccount: e.target.value })
                    }
                    className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="">— Select Receiver —</option>
                    {allWallets
                      .filter(
                        (a) => isAdmin || a.accountNumber !== user?.accountNumber,
                      )
                      .map((a) => (
                        <option key={a.accountNumber} value={a.accountNumber}>
                          {a.name} ({a.accountNumber})
                        </option>
                      ))}
                  </select>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="…or type account number manually"
                    value={txForm.receiverAccount}
                    onChange={(e) =>
                      setTxForm((f) => ({
                        ...f,
                        receiverAccount: e.target.value.trim(),
                      }))
                    }
                    className="w-full mt-2 bg-black border border-zinc-700 rounded-md px-3 py-2 text-white text-sm font-mono focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                {/* Amount in local currency — Gravity auto-calculates from this */}
                <div>
                  <label className="text-zinc-400 text-xs font-mono">
                    Amount in Local Currency ({selectedCurrency.symbol})
                  </label>
                  <div className="flex gap-2 mt-1">
                    <select
                      value={currencyCode}
                      onChange={(e) => {
                        const nextCode = e.target.value;
                        setCurrencyCode(nextCode);
                        const next =
                          CURRENCIES.find((c) => c.code === nextCode) ??
                          CURRENCIES[0];
                        // Keep the Gravity amount fixed; restate the local amount
                        // in the newly selected currency.
                        setInrAmount(
                          txForm.amount
                            ? String(
                                (Number(txForm.amount) * GRAVITY_RATE) /
                                  next.inrPerUnit,
                              )
                            : "",
                        );
                      }}
                      className="bg-black border border-zinc-700 rounded-md px-2 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code} ({c.symbol})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="e.g., 50000"
                      value={inrAmount}
                      onChange={(e) => {
                        const v = e.target.value;
                        setInrAmount(v);
                        setTxForm((f) => ({
                          ...f,
                          amount: v
                            ? String((Number(v) * fxRate) / GRAVITY_RATE)
                            : "",
                        }));
                      }}
                      className="flex-1 bg-black border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Gravity — auto-filled from INR, but still editable directly */}
                <div>
                  <label className="text-zinc-400 text-xs font-mono">
                    Amount (Gravity)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0.00"
                    value={txForm.amount}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTxForm((f) => ({ ...f, amount: v }));
                      setInrAmount(
                        v ? String((Number(v) * GRAVITY_RATE) / fxRate) : "",
                      );
                    }}
                    className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                  />
                  <p className="text-zinc-500 text-[11px] mt-1 font-mono">
                    1 Gravity = {selectedCurrency.symbol}
                    {fmt(GRAVITY_RATE / fxRate)}
                    {Number(txForm.amount) > 0 && (
                      <>
                        {" · "}Receiver gets full {fmt(Number(txForm.amount))} · 1%
                        charge {fmt(Number(txForm.amount) * 0.01)} extra from your
                        wallet (total {fmt(Number(txForm.amount) * 1.01)})
                      </>
                    )}
                  </p>
                </div>

                <button
                  onClick={handleTransfer}
                  disabled={
                    transferMutation.isPending || (!isAdmin && !myAccount)
                  }
                  className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white font-bold rounded-md transition-all text-sm border border-zinc-600"
                >
                  {transferMutation.isPending
                    ? "⏳ PROCESSING..."
                    : "🛡️ EXECUTE SECURE TRANSFER"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL: MY ACTIVITY ── */}
        <div className="lg:w-[420px] space-y-4">
          {/* My Transaction History */}
          <div className="bg-[#0F172A] border border-zinc-700/50 rounded-xl p-4 font-mono">
            <h2 className="text-cyan-400 font-bold text-sm tracking-widest mb-3">
              📊 MY TRANSACTION HISTORY
            </h2>
            {!user ? (
              <div className="text-zinc-600 text-xs">
                Login to view your transactions
              </div>
            ) : myTxns.length === 0 ? (
              <div className="text-zinc-600 text-xs">No transactions yet</div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {myTxns.map((tx) => {
                  const out = tx.fromAccount === user?.accountNumber;
                  const counterparty = out ? tx.toAccount : tx.fromAccount;
                  return (
                    <div
                      key={tx.id}
                      className={`border-l-2 pl-3 py-1 ${
                        out ? "border-red-500" : "border-green-500"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-[11px] font-bold ${
                            out ? "text-red-400" : "text-green-400"
                          }`}
                        >
                          {out ? "▲ SENT" : "▼ RECEIVED"}
                        </span>
                        <span className="text-white text-sm font-bold">
                          {fmt(tx.amount ?? 0)} G
                        </span>
                      </div>
                      <div className="text-zinc-500 text-[10px]">
                        {out ? "To" : "From"} {counterparty ?? "—"} ·{" "}
                        {fmtDate(tx.createdAt)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* My Approved Assets */}
          <div className="bg-[#0F172A] border border-zinc-700/50 rounded-xl p-4 font-mono">
            <h2 className="text-cyan-400 font-bold text-sm tracking-widest mb-3">
              ✅ MY APPROVED ASSETS
            </h2>
            {!user ? (
              <div className="text-zinc-600 text-xs">
                Login to view your assets
              </div>
            ) : approvedAssets.length === 0 ? (
              <div className="text-zinc-600 text-xs">No approved assets yet</div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {approvedAssets.map((a) => (
                  <div
                    key={a.id}
                    className="border-l-2 border-cyan-500 pl-3 py-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-white text-sm font-semibold capitalize">
                        {String(a.assetType).replace(/_/g, " ")}
                      </span>
                      {a.mintedAt && a.gravityIssued != null && (
                        <span className="text-cyan-400 text-xs font-bold">
                          +{fmt(a.gravityIssued)} G
                        </span>
                      )}
                    </div>
                    <div className="text-zinc-500 text-[10px]">
                      ₹{fmt(a.claimedValue)} ·{" "}
                      {a.mintedAt ? "Minted" : "Approved"}
                    </div>
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
