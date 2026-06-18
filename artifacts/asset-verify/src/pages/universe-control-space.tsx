import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth-provider";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useSubmitAsset,
  getListMyAssetsQueryKey,
  getGetMyAssetSummaryQueryKey,
} from "@workspace/api-client-react";
import { ObjectUploader } from "@workspace/object-storage-web";
import type { UploadResult } from "@uppy/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sparkles,
  ShieldCheck,
  FileText,
  X,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { useCurrency, CurrencySelect } from "@/components/currency-provider";
import { GRAVITY_RATE } from "@/lib/currency";

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

const SYSTEM_CORES = [
  "000000000001",
  "000000000002",
  "000000000000",
  "111111111111",
  "222222222222",
  "333333333333",
  "444444444444",
  "555555555555",
  "666666666666",
  "777777777777",
  "888888888888",
  "999999999999",
];

function fmt(n: number | string) {
  return Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const submitSchema = z.object({
  assetType: z.enum(
    ["real_estate", "debt", "equity", "commodity", "money_market"],
    {
      required_error: "Please select an asset type",
    },
  ),
  claimedValue: z.coerce.number().min(1, "Value must be greater than 0"),
  description: z.string().min(5, "Please provide a detailed description"),
  documentNote: z.string().optional(),
});

type UploadedDoc = { name: string; objectPath: string };

export default function UniverseControlSpace() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();

  const isAdmin = user?.role === "admin";
  const { format } = useCurrency();

  // ── System Accounts ─────────────────────────────────────────────────────
  const { data: accountsData, isLoading: loadingAccounts } = useQuery({
    queryKey: ["matrix-accounts"],
    queryFn: () => apiFetch("/api/matrix/accounts"),
    refetchInterval: 5000,
  });
  const accounts: any[] = accountsData?.accounts ?? [];
  const systemAccounts = accounts
    .filter((a) => SYSTEM_CORES.includes(a.accountNumber))
    .sort(
      (a, b) =>
        SYSTEM_CORES.indexOf(a.accountNumber) -
        SYSTEM_CORES.indexOf(b.accountNumber),
    );

  // ── Vault 200% backing status ───────────────────────────────────────────
  // System Vault (000000000001) is the ONLY pool that backs minting. The Users
  // Vault (000000000002) holds user custody locks — shown + counted in the Total
  // Vault, but it NEVER backs minting.
  const coreAcct = accounts.find((a) => a.accountNumber === "000000000000");
  const vaultAcct = accounts.find((a) => a.accountNumber === "000000000001");
  const usersVaultAcct = accounts.find(
    (a) => a.accountNumber === "000000000002",
  );
  const coreGravity = coreAcct ? Number(coreAcct.gravityBalance) : 0;
  const vaultValue = vaultAcct ? Number(vaultAcct.gravityBalance) : 0;
  const foundationAcct = accounts.find(
    (a) => a.accountNumber === "111111111111",
  );
  const foundationFees = foundationAcct
    ? Number(foundationAcct.gravityBalance)
    : 0;
  const usersVaultValue = usersVaultAcct
    ? Number(usersVaultAcct.gravityBalance)
    : 0;
  const totalVaultValue = vaultValue + usersVaultValue;
  const requiredVault = coreGravity * 2;
  const vaultRatio =
    coreGravity > 0
      ? (vaultValue / coreGravity) * 100
      : vaultValue > 0
        ? Infinity
        : 100;
  const vaultHealthy = vaultValue >= requiredVault;

  // ── Mint Gravity ────────────────────────────────────────────────────────
  const [mintForm, setMintForm] = useState({
    inrValue: "",
    assetTitle: "",
  });
  const gravityPreview =
    Number(mintForm.inrValue) > 0 ? Number(mintForm.inrValue) / 10000 : 0;
  // After minting `gravityPreview` G, the vault must still cover 200%.
  const afterCoreGravity = coreGravity + gravityPreview;
  const afterRequiredVault = afterCoreGravity * 2;
  const mintAllowed = vaultValue >= afterRequiredVault;

  const mintMutation = useMutation({
    mutationFn: (body: object) =>
      apiFetch("/api/matrix/mint", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      toast({
        title: "🔥 Mint Complete!",
        description: `${fmt(data.gravityTotal)} Gravity injected into the matrix`,
      });
      setMintForm({ inrValue: "", assetTitle: "" });
      qc.invalidateQueries({ queryKey: ["matrix-accounts"] });
      qc.invalidateQueries({ queryKey: ["matrix-logs"] });
    },
    onError: (e: Error) =>
      toast({
        title: "Mint Failed",
        description: e.message,
        variant: "destructive",
      }),
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

  // ── Submit Asset ────────────────────────────────────────────────────────
  const submit = useSubmitAsset();
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const objectPathsRef = useRef<
    Map<string, { name: string; objectPath: string }>
  >(new Map());

  const form = useForm<z.infer<typeof submitSchema>>({
    resolver: zodResolver(submitSchema),
    defaultValues: {
      assetType: "real_estate",
      claimedValue: 0,
      description: "",
      documentNote: "",
    },
  });

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
        description: `${newDocs.length} file(s) ready to attach to this asset.`,
      });
    }
  };

  const removeDoc = (objectPath: string) => {
    setUploadedDocs((prev) => prev.filter((d) => d.objectPath !== objectPath));
  };

  const onSubmit = (values: z.infer<typeof submitSchema>) => {
    if (uploadedDocs.length === 0) {
      toast({
        title: "Proof Documents Required",
        description:
          "Attach at least one proof document (papers / terms / legal) before submitting this asset.",
        variant: "destructive",
      });
      return;
    }
    submit.mutate(
      {
        data: {
          ...values,
          // Form value is entered in Gravity; the backend stores claimedValue
          // in ₹ (1 G = ₹GRAVITY_RATE) so Vault backing = claimedValue ÷ rate.
          claimedValue: values.claimedValue * GRAVITY_RATE,
          documentUrls: uploadedDocs.map((d) => d.objectPath),
        },
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListMyAssetsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetMyAssetSummaryQueryKey() });
          toast({
            title: "Asset Declared",
            description: "Your asset has been submitted for verification.",
          });
          form.reset();
          setUploadedDocs([]);
        },
        onError: (err: unknown) => {
          const msg = (err as { error?: string })?.error;
          toast({
            title: "Submission Failed",
            description: msg || "An error occurred while submitting the asset.",
            variant: "destructive",
          });
        },
      },
    );
  };

  if (isAuthLoading) return null;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <Sparkles className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-serif font-bold text-primary">
            Universe Control Space
          </h1>
        </div>
        <p className="text-sm text-muted-foreground mb-8 font-mono tracking-wide">
          The Universe Vault — mint Gravity, submit assets, and route the
          sovereign split across system accounts.
        </p>

        {/* ── System Accounts ── */}
        <section className="mb-10">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-xs font-bold font-mono text-cyan-400 tracking-widest">
              🔒 SYSTEM ACCOUNTS — GENESIS CORES
            </h2>
            <CurrencySelect />
          </div>
          <div
            className={`mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border px-3 py-2 text-[11px] font-mono ${
              vaultHealthy
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-red-500/40 bg-red-500/5"
            }`}
            data-testid="vault-status-banner"
          >
            <span className="text-yellow-400">
              🏦 System Vault {format(vaultValue)}
            </span>
            <span className="text-sky-400">
              👥 Users Vault {format(usersVaultValue)}
            </span>
            <span className="text-fuchsia-400">
              📊 Total Vault {format(totalVaultValue)}
            </span>
            <span className="text-cyan-400">🌌 Core {format(coreGravity)}</span>
            <span className="text-emerald-400" data-testid="foundation-fees">
              💰 Foundation Fees {format(foundationFees)}
            </span>
            <span className="text-zinc-400">
              🔒 Need {format(requiredVault)} (200%)
            </span>
            <span
              className={`font-bold ${vaultHealthy ? "text-emerald-400" : "text-red-400"}`}
            >
              {Number.isFinite(vaultRatio) ? `${fmt(vaultRatio)}%` : "∞"}{" "}
              {vaultHealthy ? "BACKED ✅" : "UNDER-BACKED ⛔"}
            </span>
          </div>
          {loadingAccounts ? (
            <div className="text-zinc-500 text-sm font-mono">
              Loading system accounts…
            </div>
          ) : systemAccounts.length === 0 ? (
            <div className="text-zinc-500 text-sm font-mono">
              No system accounts found.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {systemAccounts.map((acc) => {
                const isFounder = acc.accountNumber === "111111111111";
                const isSystem = acc.accountNumber === "000000000000";
                const isVault = acc.accountNumber === "000000000001";
                const isUsersVault = acc.accountNumber === "000000000002";
                const border = isFounder
                  ? "border-emerald-500/60"
                  : isSystem
                    ? "border-red-500/60"
                    : isVault
                      ? "border-yellow-500/60"
                      : isUsersVault
                        ? "border-sky-500/60"
                        : "border-cyan-500/30";
                const typeColor = isFounder
                  ? "text-emerald-400"
                  : isSystem
                    ? "text-red-400"
                    : isVault
                      ? "text-yellow-400"
                      : isUsersVault
                        ? "text-sky-400"
                        : "text-cyan-400";
                return (
                  <div
                    key={acc.accountNumber}
                    className={`border ${border} rounded-lg p-3 bg-zinc-950`}
                    data-testid={`account-${acc.accountNumber}`}
                  >
                    <div
                      className={`text-[10px] font-bold font-mono ${typeColor} uppercase tracking-widest`}
                    >
                      {acc.type}
                    </div>
                    <div className="text-white text-sm font-semibold leading-tight mt-0.5">
                      {acc.name}
                    </div>
                    <div className="text-zinc-500 text-[11px] font-mono mt-1">
                      {acc.accountNumber}
                    </div>
                    <div className="text-green-400 text-sm font-bold font-mono mt-1">
                      {format(acc.gravityBalance)}
                    </div>
                    {isSystem && (
                      <div className="text-red-400/70 text-[9px] font-mono tracking-widest">
                        TOTAL GRAVITY SUPPLY
                      </div>
                    )}
                    {isVault && (
                      <div className="text-yellow-400/70 text-[9px] font-mono tracking-widest">
                        SYSTEM · BACKS MINT
                      </div>
                    )}
                    {isUsersVault && (
                      <div className="text-sky-400/70 text-[9px] font-mono tracking-widest">
                        USERS CUSTODY · NO MINT
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Universe Vault ── */}
        <section>
          <h2 className="text-xs font-bold font-mono text-cyan-400 tracking-widest mb-3">
            🌌 UNIVERSE VAULT
          </h2>

          <Tabs defaultValue="mint" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="mint" data-testid="tab-mint">
                🔥 Mint Gravity
              </TabsTrigger>
              {isAdmin && (
                <TabsTrigger value="vault" data-testid="tab-vault">
                  🏦 Vault
                </TabsTrigger>
              )}
              <TabsTrigger value="submit" data-testid="tab-submit">
                📜 Submit Asset
              </TabsTrigger>
            </TabsList>

            {/* Mint Gravity */}
            <TabsContent value="mint">
              <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-950">
                {!isAdmin ? (
                  <div className="flex items-start gap-3 p-4 border border-yellow-500/30 rounded-md bg-yellow-500/5 text-yellow-400 text-sm font-mono">
                    <Lock className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>
                      FOUNDER ROOT ACCESS REQUIRED — Gravity minting is locked to
                      the founder console (Account 111111111111). Black Universe
                      citizens will be connected here soon.
                    </span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="text-zinc-400 text-xs font-mono">
                        Asset Document Registry Info *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., Plot No 42, 500 Sq Yards Certificate"
                        value={mintForm.assetTitle}
                        onChange={(e) =>
                          setMintForm({
                            ...mintForm,
                            assetTitle: e.target.value,
                          })
                        }
                        className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                        data-testid="input-asset-title"
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
                        data-testid="input-inr-value"
                      />
                      {gravityPreview > 0 && (
                        <p className="text-cyan-400 text-xs mt-1 font-mono">
                          ✨ Liquidity Expansion: {fmt(gravityPreview)} Gravity
                          Notes
                        </p>
                      )}
                    </div>

                    <div className="bg-black/50 border border-zinc-800 rounded-md p-3 text-[11px] font-mono space-y-1">
                      <div className="text-zinc-400 mb-1">
                        Sovereign Split Policy (minted Gravity → accounts):
                      </div>
                      <div className="text-red-400">
                        🌌 Total Supply → System Core 000000000000
                        {gravityPreview > 0 ? `: +${fmt(gravityPreview)} G` : ""}
                      </div>
                      <div className="text-emerald-400">
                        👑 Foundation (1%) → 111111111111
                        {gravityPreview > 0
                          ? `: ${fmt(gravityPreview * 0.01)}`
                          : ""}
                      </div>
                      <div className="text-cyan-400">
                        🏛️ Reserve (24%) → 222222222222
                        {gravityPreview > 0
                          ? `: ${fmt(gravityPreview * 0.24)}`
                          : ""}
                      </div>
                      <div className="text-cyan-400">
                        ⚖️ Stability (25%) → 333333333333
                        {gravityPreview > 0
                          ? `: ${fmt(gravityPreview * 0.25)}`
                          : ""}
                      </div>
                      <div className="text-cyan-400">
                        🛡️ Security (25%) → 444444444444
                        {gravityPreview > 0
                          ? `: ${fmt(gravityPreview * 0.25)}`
                          : ""}
                      </div>
                      <div className="text-green-400">
                        📈 Growth (25%) → 555555555555 (Growth Pool)
                        {gravityPreview > 0
                          ? `: ${fmt(gravityPreview * 0.25)}`
                          : ""}
                      </div>
                    </div>

                    {/* Vault 200% backing check */}
                    <div
                      className={`rounded-md p-3 text-[11px] font-mono border ${
                        gravityPreview > 0 && !mintAllowed
                          ? "border-red-500/40 bg-red-500/5 text-red-300"
                          : "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
                      }`}
                      data-testid="mint-vault-check"
                    >
                      <div>🏦 Vault backing held: {format(vaultValue)}</div>
                      <div>
                        🔒 Required after mint (200%): {format(afterRequiredVault)}
                      </div>
                      {gravityPreview > 0 && (
                        <div className="mt-1 font-bold">
                          {mintAllowed
                            ? "✅ Vault sufficient — mint allowed"
                            : `⛔ Under-backed by ${format(Math.max(0, afterRequiredVault - vaultValue))} — top up the Vault first`}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={handleMint}
                      disabled={
                        mintMutation.isPending ||
                        (gravityPreview > 0 && !mintAllowed)
                      }
                      className="w-full py-3 bg-gradient-to-r from-cyan-600 to-cyan-400 hover:from-cyan-500 hover:to-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed text-black font-extrabold rounded-md transition-all text-sm tracking-wide"
                      data-testid="button-execute-mint"
                    >
                      {mintMutation.isPending
                        ? "⏳ EXECUTING…"
                        : "🔥 EXECUTE GRAVITY MINT & SPLIT PIPELINE"}
                    </button>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Vault Control */}
            <TabsContent value="vault">
              <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-950">
                {!isAdmin ? (
                  <div className="flex items-start gap-3 p-4 border border-yellow-500/30 rounded-md bg-yellow-500/5 text-yellow-400 text-sm font-mono">
                    <Lock className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>
                      FOUNDER ROOT ACCESS REQUIRED — Vault control is locked to
                      the founder console.
                    </span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Live status */}
                    <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
                      <div className="border border-zinc-800 rounded-md p-3 bg-black/40">
                        <div className="text-zinc-500">VAULT (GRAVITY)</div>
                        <div className="text-yellow-400 text-base font-bold">
                          {format(vaultValue)}
                        </div>
                      </div>
                      <div className="border border-zinc-800 rounded-md p-3 bg-black/40">
                        <div className="text-zinc-500">SYSTEM CORE GRAVITY</div>
                        <div className="text-cyan-400 text-base font-bold">
                          {format(coreGravity)}
                        </div>
                      </div>
                      <div className="border border-zinc-800 rounded-md p-3 bg-black/40">
                        <div className="text-zinc-500">REQUIRED (200%)</div>
                        <div className="text-white text-base font-bold">
                          {format(requiredVault)}
                        </div>
                      </div>
                      <div
                        className={`border rounded-md p-3 ${vaultHealthy ? "border-emerald-500/40 bg-emerald-500/5" : "border-red-500/40 bg-red-500/5"}`}
                      >
                        <div className="text-zinc-500">BACKING RATIO</div>
                        <div
                          className={`text-base font-bold ${vaultHealthy ? "text-emerald-400" : "text-red-400"}`}
                        >
                          {Number.isFinite(vaultRatio)
                            ? `${fmt(vaultRatio)}%`
                            : "∞"}{" "}
                          {vaultHealthy ? "✅" : "⛔"}
                        </div>
                      </div>
                    </div>

                    {/* Vault is locked to documented deposits only */}
                    <div className="border border-zinc-800 rounded-md p-4 bg-black/40 space-y-2 text-[11px] font-mono">
                      <p className="text-zinc-200 font-bold flex items-center gap-2">
                        <Lock className="h-3.5 w-3.5 text-emerald-400" />
                        Vault is locked to documented deposits
                      </p>
                      <p className="text-zinc-400 leading-relaxed">
                        The Vault value can only change when a real asset — with
                        proof documents (papers / terms / legal) — is submitted,
                        approved, and deposited through the asset pipeline. There
                        is no manual top-up or re-anchor; numbers cannot be set
                        arbitrarily. Once deposited, the backing stays fixed
                        unless another documented asset is deposited.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Submit Asset */}
            <TabsContent value="submit">
              {!user ? (
                <div className="border border-zinc-800 rounded-xl p-8 bg-zinc-950 text-center space-y-4">
                  <p className="text-zinc-400 text-sm font-mono">
                    Sign in to declare an asset for verification.
                  </p>
                  <Button
                    onClick={() => setLocation("/dashboard")}
                    className="bg-cyan-600 hover:bg-cyan-500 text-white"
                    data-testid="button-submit-login"
                  >
                    Sign in
                  </Button>
                </div>
              ) : (
                <div className="bg-card text-card-foreground border border-card-border rounded-xl p-6 md:p-8 shadow-sm">
                  <Form {...form}>
                    <form
                      onSubmit={form.handleSubmit(onSubmit)}
                      className="space-y-6"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="assetType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Asset Classification</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger data-testid="select-asset-type">
                                    <SelectValue placeholder="Select type" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="real_estate">
                                    Real Estate
                                  </SelectItem>
                                  <SelectItem value="debt">
                                    Debt
                                  </SelectItem>
                                  <SelectItem value="equity">
                                    Equity
                                  </SelectItem>
                                  <SelectItem value="commodity">
                                    Commodity
                                  </SelectItem>
                                  <SelectItem value="money_market">
                                    Money Market
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="claimedValue"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Valuation in Gravity 🌌</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <span className="absolute left-3 top-2.5 text-muted-foreground">
                                    G
                                  </span>
                                  <Input
                                    type="number"
                                    step="any"
                                    className="pl-7 font-serif"
                                    placeholder="100000"
                                    {...field}
                                    data-testid="input-value"
                                  />
                                </div>
                              </FormControl>
                              <FormDescription>
                                Declare the asset's value in Gravity (1 G = ₹
                                {GRAVITY_RATE.toLocaleString("en-IN")}). On
                                approval it locks into the Vault automatically.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Detailed Description</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Provide exact details: addresses, VINs, serial numbers, or ticker symbols."
                                className="min-h-[100px]"
                                {...field}
                                data-testid="input-description"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="documentNote"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Document / Reference Number</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Enter a registration / deed / certificate number, or any reference. A number alone is fine."
                                className="min-h-[80px]"
                                {...field}
                                data-testid="input-doc-note"
                              />
                            </FormControl>
                            <FormDescription>
                              Optional extra reference (e.g., registration / deed
                              number) to accompany your uploaded documents.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="space-y-3">
                        <div>
                          <p className="text-sm font-medium leading-none mb-1">
                            Proof Documents{" "}
                            <span className="text-red-500">*</span>
                          </p>
                          <p className="text-sm text-muted-foreground mb-3">
                            Upload images or PDFs of deeds, titles, certificates,
                            or any supporting proof (required).
                          </p>
                        </div>

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
                          buttonClassName="flex items-center gap-2 px-4 py-2 rounded-md border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 text-sm font-medium text-slate-700 transition-colors w-full justify-center"
                        >
                          <FileText className="h-4 w-4" /> Upload Proof Documents
                          (images / PDF, max 10 MB each)
                        </ObjectUploader>

                        {uploadedDocs.length > 0 && (
                          <div className="space-y-2 mt-3">
                            <p className="text-sm font-medium text-green-700 flex items-center gap-1">
                              <CheckCircle2 className="h-4 w-4" />{" "}
                              {uploadedDocs.length} document(s) attached
                            </p>
                            {uploadedDocs.map((doc) => (
                              <div
                                key={doc.objectPath}
                                className="flex items-center justify-between bg-slate-50 border rounded px-3 py-2 text-sm"
                              >
                                <div className="flex items-center gap-2 text-muted-foreground truncate">
                                  <FileText className="h-4 w-4 flex-shrink-0" />
                                  <span className="truncate">{doc.name}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeDoc(doc.objectPath)}
                                  className="ml-2 text-muted-foreground hover:text-destructive flex-shrink-0"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex justify-end gap-4 pt-4 border-t">
                        <Button
                          type="submit"
                          disabled={submit.isPending}
                          className="gap-2"
                          data-testid="button-submit-asset"
                        >
                          <ShieldCheck className="h-4 w-4" />
                          {submit.isPending
                            ? "Submitting…"
                            : "Submit for Verification"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </section>
      </div>
    </Layout>
  );
}
