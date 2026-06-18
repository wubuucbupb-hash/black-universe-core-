import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth-provider";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  useListMyAssets,
  getListMyAssetsQueryKey,
} from "@workspace/api-client-react";
import { ObjectUploader } from "@workspace/object-storage-web";
import type { UploadResult } from "@uppy/core";
import { FileText, X, CheckCircle2 } from "lucide-react";
import {
  GRAVITY_RATE,
  STATIC_INR_PER_UNIT,
  currencyOptions,
  currencySymbol,
  detectDefaultCurrency,
  fetchInrPerUnitRates,
} from "@/lib/currency";
import { GRAVITY } from "@/components/currency-provider";

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
  return Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
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

type UploadedDoc = { name: string; objectPath: string };

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
  // Selectable transfer counterparties. Regular citizens never see the System
  // Core (000000000000) or Reserve Vault (000000000001); admins can route funds
  // through them, so they get the full account list.
  const allWallets = accounts.filter(
    (a) =>
      a.accountNumber !== "000000000000" &&
      a.accountNumber !== "000000000001",
  );
  const transferWallets = isAdmin ? accounts : allWallets;

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
  const [mintForm, setMintForm] = useState({
    inrValue: "",
    assetTitle: "",
    assetType: "real_estate",
    description: "",
  });
  const gravityPreview =
    Number(mintForm.inrValue) > 0 ? Number(mintForm.inrValue) / 10000 : 0;
  const [mintCurrency, setMintCurrency] = useState("INR");
  const [mintLocalAmount, setMintLocalAmount] = useState("");

  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const objectPathsRef = useRef<Map<string, UploadedDoc>>(new Map());

  const handleUploadComplete = (
    result: UploadResult<Record<string, unknown>, Record<string, unknown>>,
  ) => {
    const newDocs: UploadedDoc[] = [];
    for (const file of result.successful ?? []) {
      const stored = objectPathsRef.current.get(file.id);
      if (stored) newDocs.push(stored);
    }
    setUploadedDocs((prev) => [...prev, ...newDocs]);
    if (newDocs.length > 0) {
      toast({
        title: "Document Uploaded",
        description: `${newDocs.length} file(s) ready to attach to this mint.`,
      });
    }
  };

  const removeDoc = (objectPath: string) => {
    setUploadedDocs((prev) => prev.filter((d) => d.objectPath !== objectPath));
  };

  const mintMutation = useMutation({
    mutationFn: (body: object) =>
      apiFetch("/api/matrix/mint", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (data) => {
      toast({
        title: "🔥 Mint Complete!",
        description: `${fmt(data.gravityTotal)} Gravity injected into the matrix`,
      });
      setMintForm({
        inrValue: "",
        assetTitle: "",
        assetType: "real_estate",
        description: "",
      });
      setMintLocalAmount("");
      setUploadedDocs([]);
      objectPathsRef.current.clear();
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
    if (uploadedDocs.length === 0) {
      toast({
        title: "Proof Documents Required",
        description:
          "Attach at least one proof document (papers / terms / legal) backing this mint.",
        variant: "destructive",
      });
      return;
    }
    mintMutation.mutate({
      inrValue: mintForm.inrValue,
      assetTitle: mintForm.assetTitle,
      assetType: mintForm.assetType,
      description: mintForm.description,
      documentUrls: uploadedDocs.map((d) => d.objectPath),
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
  const [currencyCode, setCurrencyCode] = useState(detectDefaultCurrency);
  // Live INR-per-unit rates, seeded with the offline fallback then refreshed.
  const [rates, setRates] = useState<Record<string, number>>(
    () => STATIC_INR_PER_UNIT,
  );
  useEffect(() => {
    let active = true;
    fetchInrPerUnitRates()
      .then((live) => {
        if (active) setRates((prev) => ({ ...prev, ...live }));
      })
      .catch(() => {
        // keep the static fallback rates
      });
    return () => {
      active = false;
    };
  }, []);
  const options = useMemo(() => currencyOptions(), []);
  const isGravity = currencyCode === GRAVITY;
  const selectedSymbol = isGravity ? "G" : currencySymbol(currencyCode);
  // INR value of one unit of the selected currency. May be unknown for an exotic
  // currency when offline — then the local-currency convenience input is hidden
  // and the citizen enters Gravity directly.
  const fxRate = isGravity
    ? GRAVITY_RATE
    : rates[currencyCode] ?? STATIC_INR_PER_UNIT[currencyCode];
  const rateKnown = isGravity || (typeof fxRate === "number" && fxRate > 0);
  const mintIsGravity = mintCurrency === GRAVITY;
  const mintSymbol = mintIsGravity ? "G" : currencySymbol(mintCurrency);
  const mintFxRate = mintIsGravity
    ? GRAVITY_RATE
    : rates[mintCurrency] ?? STATIC_INR_PER_UNIT[mintCurrency];
  const mintRateKnown =
    mintIsGravity || (typeof mintFxRate === "number" && mintFxRate > 0);

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

  // ── Black Universe Equity (Gravity → Equity) ────────────────────────────────
  const EQUITY_PRICE_GRAVITY = 100; // display mirror of the server constant
  const [equityGravity, setEquityGravity] = useState("");
  const myEquity = myAccount ? Number(myAccount.equityUnits ?? 0) : 0;
  const equityPreview =
    Number(equityGravity) > 0 ? Number(equityGravity) / EQUITY_PRICE_GRAVITY : 0;

  const equityMutation = useMutation({
    mutationFn: (gravityAmount: string) =>
      apiFetch("/api/matrix/equity/buy", {
        method: "POST",
        body: JSON.stringify({ gravityAmount }),
      }),
    onSuccess: (data) => {
      toast({
        title: "📜 Equity Acquired!",
        description: `+${fmt(data.equityUnits)} BU Equity for ${fmt(data.gravitySpent)} Gravity`,
      });
      setEquityGravity("");
      qc.invalidateQueries({ queryKey: ["matrix-accounts"] });
      qc.invalidateQueries({ queryKey: ["my-transactions"] });
    },
    onError: (e: Error) =>
      toast({
        title: "Equity Purchase Failed",
        description: e.message,
        variant: "destructive",
      }),
  });

  function handleBuyEquity() {
    const g = Number(equityGravity);
    if (!g || g <= 0) {
      toast({
        title: "Missing Amount",
        description: "Enter how much Gravity to spend",
        variant: "destructive",
      });
      return;
    }
    if (myAccount && g > Number(myAccount.gravityBalance)) {
      toast({
        title: "Insufficient Gravity",
        description: "You don't have that much Gravity",
        variant: "destructive",
      });
      return;
    }
    equityMutation.mutate(equityGravity);
  }

  // ── INR → Gravity Gateway ───────────────────────────────────────────────────
  const { data: gatewayData } = useQuery({
    queryKey: ["gateway-settings"],
    queryFn: () => apiFetch("/api/matrix/gateway-settings"),
    enabled: !!user,
  });
  const gateway = gatewayData?.settings ?? null;

  const { data: myPurchasesData } = useQuery({
    queryKey: ["my-gravity-purchases"],
    queryFn: () => apiFetch("/api/matrix/my-gravity-purchases"),
    enabled: !!user,
    refetchInterval: 8000,
  });
  const myPurchases: any[] = myPurchasesData?.requests ?? [];

  const [buyInr, setBuyInr] = useState("");
  const [buyRef, setBuyRef] = useState("");
  const buyGravityPreview =
    Number(buyInr) > 0 ? Number(buyInr) / GRAVITY_RATE : 0;

  const [proofDocs, setProofDocs] = useState<UploadedDoc[]>([]);
  const proofPathsRef = useRef<Map<string, UploadedDoc>>(new Map());
  const handleProofComplete = (
    result: UploadResult<Record<string, unknown>, Record<string, unknown>>,
  ) => {
    const newDocs: UploadedDoc[] = [];
    for (const file of result.successful ?? []) {
      const stored = proofPathsRef.current.get(file.id);
      if (stored) newDocs.push(stored);
    }
    setProofDocs((prev) => [...prev, ...newDocs]);
    if (newDocs.length > 0) {
      toast({
        title: "Proof Uploaded",
        description: `${newDocs.length} file(s) attached.`,
      });
    }
  };
  const removeProof = (objectPath: string) =>
    setProofDocs((prev) => prev.filter((d) => d.objectPath !== objectPath));

  const purchaseMutation = useMutation({
    mutationFn: (body: object) =>
      apiFetch("/api/matrix/gravity-purchase", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast({
        title: "✅ Request Submitted",
        description: "Admin will verify your payment and credit Gravity.",
      });
      setBuyInr("");
      setBuyRef("");
      setProofDocs([]);
      proofPathsRef.current.clear();
      qc.invalidateQueries({ queryKey: ["my-gravity-purchases"] });
    },
    onError: (e: Error) =>
      toast({
        title: "Request Failed",
        description: e.message,
        variant: "destructive",
      }),
  });

  function handleBuyGravity() {
    if (!buyInr || Number(buyInr) <= 0) {
      toast({
        title: "Missing Amount",
        description: "Enter the INR amount you paid",
        variant: "destructive",
      });
      return;
    }
    if (proofDocs.length === 0) {
      toast({
        title: "Proof Required",
        description: "Upload your payment screenshot / receipt",
        variant: "destructive",
      });
      return;
    }
    purchaseMutation.mutate({
      inrAmount: buyInr,
      reference: buyRef,
      proofUrls: proofDocs.map((d) => d.objectPath),
    });
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
                    Asset Class *
                  </label>
                  <select
                    value={mintForm.assetType}
                    onChange={(e) =>
                      setMintForm({ ...mintForm, assetType: e.target.value })
                    }
                    className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="real_estate">Real Estate</option>
                    <option value="commodity">Commodity</option>
                    <option value="equity">Equity</option>
                    <option value="debt">Debt</option>
                    <option value="money_market">Money Market</option>
                  </select>
                </div>

                <div>
                  <label className="text-zinc-400 text-xs font-mono">
                    Asset Valuation ({mintSymbol}) *
                  </label>
                  <div className="flex gap-2 mt-1">
                    <select
                      value={mintCurrency}
                      onChange={(e) => {
                        const next = e.target.value;
                        setMintCurrency(next);
                        const nextRate =
                          next === GRAVITY
                            ? GRAVITY_RATE
                            : rates[next] ?? STATIC_INR_PER_UNIT[next];
                        setMintLocalAmount(
                          mintForm.inrValue && nextRate
                            ? String(Number(mintForm.inrValue) / nextRate)
                            : "",
                        );
                      }}
                      className="bg-black border border-zinc-700 rounded-md px-2 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none max-w-[8rem]"
                    >
                      <option value={GRAVITY}>🌌 Gravity (G)</option>
                      {options.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code} {c.symbol !== c.code ? `(${c.symbol})` : ""}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="e.g., 5000000"
                      value={mintLocalAmount}
                      disabled={!mintRateKnown}
                      onChange={(e) => {
                        const v = e.target.value;
                        setMintLocalAmount(v);
                        setMintForm((f) => ({
                          ...f,
                          inrValue:
                            v && mintRateKnown
                              ? String(Number(v) * mintFxRate)
                              : "",
                        }));
                      }}
                      className="flex-1 bg-black border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none disabled:opacity-50"
                    />
                  </div>
                  {!mintRateKnown && (
                    <p className="text-amber-500/80 text-[11px] mt-1 font-mono">
                      Live rate for {mintCurrency} unavailable — pick another
                      currency or Gravity.
                    </p>
                  )}
                  {!mintIsGravity && mintCurrency !== "INR" && gravityPreview > 0 && (
                    <p className="text-zinc-500 text-[11px] mt-1 font-mono">
                      ≈ ₹{fmt(Number(mintForm.inrValue))} INR backing
                    </p>
                  )}
                  {gravityPreview > 0 && (
                    <p className="text-cyan-400 text-xs mt-1 font-mono">
                      ✨ Liquidity Expansion: {fmt(gravityPreview)} Gravity Notes
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-zinc-400 text-xs font-mono">
                    Asset Details / Notes
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Describe the backing asset, terms, references…"
                    value={mintForm.description}
                    onChange={(e) =>
                      setMintForm({ ...mintForm, description: e.target.value })
                    }
                    className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none resize-none"
                  />
                </div>

                <div>
                  <label className="text-zinc-400 text-xs font-mono">
                    Proof Documents <span className="text-red-500">*</span>
                  </label>
                  <p className="text-zinc-600 text-[11px] font-mono mt-1 mb-2">
                    Upload deeds, titles, certificates or terms (images / PDF,
                    max 10 MB each). Required to back this mint.
                  </p>
                  <ObjectUploader
                    maxNumberOfFiles={5}
                    maxFileSize={10 * 1024 * 1024}
                    onGetUploadParameters={async (file) => {
                      const res = await fetch(
                        "/api/storage/uploads/request-url",
                        {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          credentials: "include",
                          body: JSON.stringify({
                            name: file.name,
                            size: file.size,
                            contentType: file.type,
                          }),
                        },
                      );
                      const { uploadURL, objectPath } = await res.json();
                      objectPathsRef.current.set(file.id, {
                        name: file.name,
                        objectPath,
                      });
                      return {
                        method: "PUT" as const,
                        url: uploadURL,
                        headers: { "Content-Type": file.type },
                      };
                    }}
                    onComplete={handleUploadComplete}
                    buttonClassName="flex items-center gap-2 px-4 py-2 rounded-md border border-dashed border-zinc-700 bg-black hover:bg-zinc-900 text-sm font-medium text-zinc-300 transition-colors w-full justify-center"
                  >
                    <FileText className="h-4 w-4" /> Upload Proof Documents
                  </ObjectUploader>

                  {uploadedDocs.length > 0 && (
                    <div className="space-y-2 mt-3">
                      <p className="text-sm font-medium text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="h-4 w-4" />{" "}
                        {uploadedDocs.length} document(s) attached
                      </p>
                      {uploadedDocs.map((doc) => (
                        <div
                          key={doc.objectPath}
                          className="flex items-center justify-between bg-black border border-zinc-800 rounded px-3 py-2 text-sm"
                        >
                          <div className="flex items-center gap-2 text-zinc-400 truncate">
                            <FileText className="h-4 w-4 flex-shrink-0" />
                            <span className="truncate">{doc.name}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeDoc(doc.objectPath)}
                            className="ml-2 text-zinc-500 hover:text-red-400 flex-shrink-0"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
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
                      {transferWallets.map((a) => (
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
                    {transferWallets
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
                    Amount in Local Currency ({selectedSymbol})
                  </label>
                  <div className="flex gap-2 mt-1">
                    <select
                      value={currencyCode}
                      onChange={(e) => {
                        const nextCode = e.target.value;
                        setCurrencyCode(nextCode);
                        // Keep the Gravity amount fixed; restate the local amount
                        // in the newly selected currency.
                        const nextRate =
                          nextCode === GRAVITY
                            ? GRAVITY_RATE
                            : rates[nextCode] ?? STATIC_INR_PER_UNIT[nextCode];
                        setInrAmount(
                          txForm.amount && nextRate
                            ? String(
                                (Number(txForm.amount) * GRAVITY_RATE) /
                                  nextRate,
                              )
                            : "",
                        );
                      }}
                      className="bg-black border border-zinc-700 rounded-md px-2 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none max-w-[8rem]"
                    >
                      <option value={GRAVITY}>🌌 Gravity (G)</option>
                      {options.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code} {c.symbol !== c.code ? `(${c.symbol})` : ""}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="e.g., 50000"
                      value={inrAmount}
                      disabled={!rateKnown}
                      onChange={(e) => {
                        const v = e.target.value;
                        setInrAmount(v);
                        setTxForm((f) => ({
                          ...f,
                          amount:
                            v && rateKnown
                              ? String((Number(v) * fxRate) / GRAVITY_RATE)
                              : f.amount,
                        }));
                      }}
                      className="flex-1 bg-black border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none disabled:opacity-50"
                    />
                  </div>
                  {!rateKnown && (
                    <p className="text-amber-500/80 text-[11px] mt-1 font-mono">
                      Live rate for {currencyCode} unavailable — enter Gravity
                      directly below.
                    </p>
                  )}
                </div>

                {/* Gravity — auto-filled from INR, but still editable directly */}
                <div>
                  <label className="text-zinc-400 text-xs font-mono">
                    Amount (Gravity)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    placeholder="0.0000"
                    value={txForm.amount}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTxForm((f) => ({ ...f, amount: v }));
                      setInrAmount(
                        v && rateKnown
                          ? String((Number(v) * GRAVITY_RATE) / fxRate)
                          : "",
                      );
                    }}
                    className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                  />
                  <p className="text-zinc-500 text-[11px] mt-1 font-mono">
                    {rateKnown && (
                      <>
                        1 Gravity = {selectedSymbol}
                        {fmt(GRAVITY_RATE / fxRate)}
                      </>
                    )}
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

          {/* Buy Black Universe Equity */}
          <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-950">
            <h2 className="text-sm font-bold font-mono text-cyan-400 mb-1 tracking-widest">
              📜 BLACK UNIVERSE EQUITY
            </h2>
            <p className="text-zinc-600 text-[11px] font-mono mb-4">
              Convert Gravity into Black Universe Equity.{" "}
              {EQUITY_PRICE_GRAVITY} Gravity = 1 Equity unit.
            </p>
            {!user ? (
              <div className="p-3 border border-zinc-700 rounded-md text-zinc-500 text-sm font-mono">
                Login required to buy equity
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-black border border-zinc-800 rounded-md px-3 py-2 flex items-center justify-between">
                  <span className="text-zinc-500 text-xs font-mono">
                    Your Equity
                  </span>
                  <span className="text-cyan-400 font-bold font-mono">
                    {fmt(myEquity)} units
                  </span>
                </div>
                <div>
                  <label className="text-zinc-400 text-xs font-mono">
                    Gravity to Spend
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    placeholder="0.0000"
                    value={equityGravity}
                    onChange={(e) => setEquityGravity(e.target.value)}
                    className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                  />
                  <p className="text-zinc-500 text-[11px] mt-1 font-mono">
                    {myAccount ? (
                      <>Available: {fmt(myAccount.gravityBalance)} G · </>
                    ) : null}
                    {equityPreview > 0 && (
                      <>You receive ≈ {fmt(equityPreview)} Equity units</>
                    )}
                  </p>
                </div>
                <button
                  onClick={handleBuyEquity}
                  disabled={equityMutation.isPending || !myAccount}
                  className="w-full py-3 bg-gradient-to-r from-purple-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 disabled:opacity-50 text-black font-extrabold rounded-md transition-all text-sm tracking-wide"
                >
                  {equityMutation.isPending ? "⏳ PROCESSING..." : "📜 BUY EQUITY"}
                </button>
              </div>
            )}
          </div>

          {/* Buy Gravity — INR Gateway */}
          <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-950">
            <h2 className="text-sm font-bold font-mono text-cyan-400 mb-1 tracking-widest">
              💱 GRAVITY EXCHANGE · INR
            </h2>
            <p className="text-zinc-600 text-[11px] font-mono mb-4">
              Exchange INR for Gravity. Transfer INR to the account below, upload
              proof, and submit. Admin verifies &amp; credits Gravity at ₹
              {GRAVITY_RATE.toLocaleString("en-IN")} = 1 G.
            </p>
            {!user ? (
              <div className="p-3 border border-zinc-700 rounded-md text-zinc-500 text-sm font-mono">
                Login required to exchange Gravity
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-black border border-zinc-800 rounded-md p-3 space-y-1 text-xs font-mono">
                  <div className="text-zinc-500 mb-1 tracking-widest">PAY TO</div>
                  {gateway && (gateway.accountNumber || gateway.upiId) ? (
                    <>
                      {gateway.bankName && (
                        <div className="text-zinc-300">🏦 {gateway.bankName}</div>
                      )}
                      {gateway.accountName && (
                        <div className="text-zinc-300">
                          👤 {gateway.accountName}
                        </div>
                      )}
                      {gateway.accountNumber && (
                        <div className="text-zinc-300">
                          #️⃣ A/C {gateway.accountNumber}
                        </div>
                      )}
                      {gateway.ifsc && (
                        <div className="text-zinc-300">🔤 IFSC {gateway.ifsc}</div>
                      )}
                      {gateway.upiId && (
                        <div className="text-cyan-400">📲 UPI {gateway.upiId}</div>
                      )}
                      {gateway.instructions && (
                        <div className="text-zinc-500 mt-1">
                          {gateway.instructions}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-zinc-600">
                      Bank details not configured yet. Please contact admin.
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-zinc-400 text-xs font-mono">
                    INR Paid (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    value={buyInr}
                    onChange={(e) => setBuyInr(e.target.value)}
                    className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                  />
                  <p className="text-zinc-500 text-[11px] mt-1 font-mono">
                    {buyGravityPreview > 0 && (
                      <>You get ≈ {fmt(buyGravityPreview)} Gravity</>
                    )}
                  </p>
                </div>
                <div>
                  <label className="text-zinc-400 text-xs font-mono">
                    Payment Reference / UTR (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="UTR / txn id"
                    value={buyRef}
                    onChange={(e) => setBuyRef(e.target.value)}
                    className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 text-xs font-mono">
                    Payment Proof <span className="text-red-500">*</span>
                  </label>
                  <p className="text-zinc-600 text-[11px] font-mono mt-1 mb-2">
                    Screenshot / receipt of your INR payment (image / PDF, max 10
                    MB).
                  </p>
                  <ObjectUploader
                    maxNumberOfFiles={3}
                    maxFileSize={10 * 1024 * 1024}
                    onGetUploadParameters={async (file) => {
                      const res = await fetch(
                        "/api/storage/uploads/request-url",
                        {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          credentials: "include",
                          body: JSON.stringify({
                            name: file.name,
                            size: file.size,
                            contentType: file.type,
                          }),
                        },
                      );
                      const { uploadURL, objectPath } = await res.json();
                      proofPathsRef.current.set(file.id, {
                        name: file.name,
                        objectPath,
                      });
                      return {
                        method: "PUT" as const,
                        url: uploadURL,
                        headers: { "Content-Type": file.type },
                      };
                    }}
                    onComplete={handleProofComplete}
                    buttonClassName="flex items-center gap-2 px-4 py-2 rounded-md border border-dashed border-zinc-700 bg-black hover:bg-zinc-900 text-sm font-medium text-zinc-300 transition-colors w-full justify-center"
                  >
                    <FileText className="h-4 w-4" /> Upload Payment Proof
                  </ObjectUploader>
                  {proofDocs.length > 0 && (
                    <div className="space-y-2 mt-3">
                      <p className="text-sm font-medium text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="h-4 w-4" /> {proofDocs.length}{" "}
                        file(s) attached
                      </p>
                      {proofDocs.map((doc) => (
                        <div
                          key={doc.objectPath}
                          className="flex items-center justify-between bg-black border border-zinc-800 rounded px-3 py-2 text-sm"
                        >
                          <div className="flex items-center gap-2 text-zinc-400 truncate">
                            <FileText className="h-4 w-4 flex-shrink-0" />
                            <span className="truncate">{doc.name}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeProof(doc.objectPath)}
                            className="ml-2 text-zinc-500 hover:text-red-400 flex-shrink-0"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={handleBuyGravity}
                  disabled={purchaseMutation.isPending}
                  className="w-full py-3 bg-gradient-to-r from-emerald-600 to-cyan-500 hover:from-emerald-500 hover:to-cyan-400 disabled:opacity-50 text-black font-extrabold rounded-md transition-all text-sm tracking-wide"
                >
                  {purchaseMutation.isPending
                    ? "⏳ SUBMITTING..."
                    : "💱 SUBMIT EXCHANGE REQUEST"}
                </button>

                {myPurchases.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="text-zinc-500 text-[11px] font-mono tracking-widest">
                      MY REQUESTS
                    </div>
                    {myPurchases.map((p) => (
                      <div
                        key={p.id}
                        className="bg-black border border-zinc-800 rounded px-3 py-2 text-xs font-mono flex items-center justify-between"
                      >
                        <div>
                          <div className="text-zinc-300">
                            ₹{fmt(p.inrAmount)} → {fmt(p.gravityAmount)} G
                          </div>
                          <div className="text-zinc-600 text-[10px]">
                            {fmtDate(p.createdAt)}
                            {p.rejectionReason ? ` · ${p.rejectionReason}` : ""}
                          </div>
                        </div>
                        <span
                          className={
                            p.status === "approved"
                              ? "text-emerald-400 font-bold"
                              : p.status === "rejected"
                                ? "text-red-400 font-bold"
                                : "text-yellow-400 font-bold"
                          }
                        >
                          {p.status.toUpperCase()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
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
