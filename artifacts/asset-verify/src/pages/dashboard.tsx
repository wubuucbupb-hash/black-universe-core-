import { useState, useEffect, useMemo, type FormEvent } from "react";
import { useAuth } from "@/components/auth-provider";
import { Layout } from "@/components/layout";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  useGetMyAssetSummary,
  getGetMyAssetSummaryQueryKey,
  useListMyAssets,
  getListMyAssetsQueryKey,
  useDeleteAsset,
} from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  GRAVITY_RATE,
  STATIC_INR_PER_UNIT,
  currencyOptions,
  currencySymbol,
  fetchInrPerUnitRates,
} from "@/lib/currency";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, AlertCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Dashboard() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [txForm, setTxForm] = useState({ receiverAccount: "", amount: "" });
  const [localAmount, setLocalAmount] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  const { data: matrixData } = useQuery({
    queryKey: ["matrix-accounts"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/matrix/accounts`, {
        credentials: "include",
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!user,
    refetchInterval: 8000,
  });

  const allAccounts: any[] = matrixData?.accounts ?? [];
  const myAccount = allAccounts.find(
    (a: any) => a.accountNumber === user?.accountNumber,
  );
  const myGravity = myAccount ? Number(myAccount.gravityBalance) : 0;

  function fmtG(n: number | string) {
    return Number(n).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  // ── Local-currency display (default INR; user can pick any world currency) ────
  const [currencyCode, setCurrencyCode] = useState(
    () => localStorage.getItem("bu_pref_currency") || "INR",
  );
  const [rates, setRates] = useState<Record<string, number>>(
    () => STATIC_INR_PER_UNIT,
  );
  useEffect(() => {
    let active = true;
    fetchInrPerUnitRates()
      .then((live) => {
        if (active) setRates((prev) => ({ ...prev, ...live }));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const currencyList = useMemo(() => currencyOptions(), []);
  const selectedSymbol = currencySymbol(currencyCode);
  const fxRate = rates[currencyCode] ?? STATIC_INR_PER_UNIT[currencyCode];
  const rateKnown = typeof fxRate === "number" && fxRate > 0;

  function handleCurrencyChange(next: string) {
    setCurrencyCode(next);
    try {
      localStorage.setItem("bu_pref_currency", next);
    } catch {
      // ignore storage write errors
    }
    const nextRate = rates[next] ?? STATIC_INR_PER_UNIT[next];
    setLocalAmount(
      txForm.amount && nextRate
        ? String((Number(txForm.amount) * GRAVITY_RATE) / nextRate)
        : "",
    );
  }

  const { data: summary, isLoading: isSummaryLoading } = useGetMyAssetSummary({
    query: {
      queryKey: getGetMyAssetSummaryQueryKey(),
      enabled: !!user,
    },
  });

  const { data: assets, isLoading: isAssetsLoading } = useListMyAssets({
    query: {
      queryKey: getListMyAssetsQueryKey(),
      enabled: !!user,
    },
  });

  const deleteAsset = useDeleteAsset();

  if (isAuthLoading) {
    return (
      <Layout>
        <div className="p-8">
          <Skeleton className="h-[400px] w-full" />
        </div>
      </Layout>
    );
  }

  if (!user) {
    setLocation("/");
    return null;
  }

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to withdraw this asset declaration?")) {
      deleteAsset.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({
              queryKey: getListMyAssetsQueryKey(),
            });
            queryClient.invalidateQueries({
              queryKey: getGetMyAssetSummaryQueryKey(),
            });
            toast({
              title: "Asset Withdrawn",
              description: "The asset declaration has been removed.",
            });
          },
          onError: () => {
            toast({
              title: "Error",
              description: "Failed to withdraw asset.",
              variant: "destructive",
            });
          },
        },
      );
    }
  };

  const handleTransfer = async (e: FormEvent) => {
    e.preventDefault();
    if (
      !txForm.receiverAccount ||
      !txForm.amount ||
      Number(txForm.amount) <= 0
    ) {
      toast({
        title: "Missing Fields",
        description: "Recipient and amount are required.",
        variant: "destructive",
      });
      return;
    }
    if (txForm.receiverAccount === user.accountNumber) {
      toast({
        title: "Invalid Recipient",
        description: "You cannot send to your own wallet.",
        variant: "destructive",
      });
      return;
    }
    setIsTransferring(true);
    try {
      const res = await fetch(`${BASE}/api/matrix/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          receiverAccount: txForm.receiverAccount,
          amount: Number(txForm.amount),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Transfer failed");
      toast({
        title: "Transfer Complete",
        description: `Sent ${fmtG(data.received)} G (1% network fee applied).`,
      });
      setTxForm({ receiverAccount: "", amount: "" });
      setLocalAmount("");
      queryClient.invalidateQueries({ queryKey: ["matrix-accounts"] });
    } catch (err) {
      toast({
        title: "Transfer Failed",
        description:
          err instanceof Error ? err.message : "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setIsTransferring(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return (
          <Badge className="bg-green-600 hover:bg-green-700">Verified</Badge>
        );
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return (
          <Badge
            variant="secondary"
            className="bg-accent/20 text-accent-foreground border-accent/30"
          >
            Under Review
          </Badge>
        );
    }
  };

  const formatAssetType = (type: string) => {
    return type
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-serif font-bold mb-8 text-primary">
          Portfolio Overview
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Total Asset Value
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isSummaryLoading ? (
                <Skeleton className="h-10 w-32" />
              ) : (
                <div
                  className="text-4xl font-serif font-semibold text-primary"
                  data-testid="text-total-asset-value"
                >
                  {formatCurrency(summary?.totalClaimedValue || 0)}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Combined value of all declared assets
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Your Gravity Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className="text-4xl font-serif font-semibold text-cyan-600"
                data-testid="text-gravity-balance"
              >
                {fmtG(myGravity)} <span className="text-2xl">G</span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span
                  className="text-sm font-semibold text-primary"
                  data-testid="text-gravity-balance-local"
                >
                  ≈{" "}
                  {rateKnown
                    ? `${selectedSymbol}${fmtG((myGravity * GRAVITY_RATE) / fxRate)}`
                    : "—"}
                </span>
                <select
                  value={currencyCode}
                  onChange={(e) => handleCurrencyChange(e.target.value)}
                  className="ml-auto border rounded-md px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-cyan-500 max-w-[7.5rem]"
                  data-testid="select-balance-currency"
                  aria-label="Display currency"
                >
                  {currencyList.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} {c.symbol !== c.code ? `(${c.symbol})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-muted-foreground mt-1 font-mono">
                {user.accountNumber
                  ? `Wallet ${user.accountNumber}`
                  : "No wallet linked"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Asset Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isSummaryLoading ? (
                <Skeleton className="h-10 w-32" />
              ) : (
                <div className="flex gap-4 text-sm mt-2">
                  <div className="flex flex-col">
                    <span className="text-muted-foreground">Pending</span>
                    <span className="font-semibold text-lg">
                      {summary?.totalPending || 0}
                    </span>
                  </div>
                  <div className="w-px bg-border" />
                  <div className="flex flex-col">
                    <span className="text-muted-foreground">Verified</span>
                    <span className="font-semibold text-lg text-green-600">
                      {summary?.totalApproved || 0}
                    </span>
                  </div>
                  <div className="w-px bg-border" />
                  <div className="flex flex-col">
                    <span className="text-muted-foreground">Rejected</span>
                    <span className="font-semibold text-lg text-destructive">
                      {summary?.totalRejected || 0}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── SEND GRAVITY (P2P TRANSFER) ── */}
        <Card className="mb-10">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-serif font-bold text-primary">
              Send Gravity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {user.accountNumber ? (
              <>
                <form
                  onSubmit={handleTransfer}
                  className="flex flex-col sm:flex-row gap-3 sm:items-end"
                >
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Recipient Account Number
                    </label>
                    <Input
                      value={txForm.receiverAccount}
                      onChange={(e) =>
                        setTxForm({
                          ...txForm,
                          receiverAccount: e.target.value,
                        })
                      }
                      placeholder="e.g. 100000000001"
                      data-testid="input-transfer-recipient"
                    />
                  </div>
                  <div className="w-full sm:w-56">
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Amount in {selectedSymbol}
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={currencyCode}
                        onChange={(e) => handleCurrencyChange(e.target.value)}
                        className="border rounded-md px-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-cyan-500 max-w-[6rem]"
                        data-testid="select-transfer-currency"
                        aria-label="Transfer currency"
                      >
                        {currencyList.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.code}
                          </option>
                        ))}
                      </select>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={localAmount}
                        disabled={!rateKnown}
                        onChange={(e) => {
                          const v = e.target.value;
                          setLocalAmount(v);
                          setTxForm((f) => ({
                            ...f,
                            amount:
                              v && rateKnown
                                ? String((Number(v) * fxRate) / GRAVITY_RATE)
                                : "",
                          }));
                        }}
                        placeholder="e.g. 50000"
                        data-testid="input-transfer-local-amount"
                      />
                    </div>
                  </div>
                  <div className="w-full sm:w-44">
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Amount (G)
                    </label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={txForm.amount}
                      onChange={(e) => {
                        const v = e.target.value;
                        setTxForm({ ...txForm, amount: v });
                        setLocalAmount(
                          v && rateKnown
                            ? String((Number(v) * GRAVITY_RATE) / fxRate)
                            : "",
                        );
                      }}
                      placeholder="0.00"
                      data-testid="input-transfer-amount"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={isTransferring}
                    data-testid="button-send-gravity"
                  >
                    {isTransferring ? "Sending..." : "Send"}
                  </Button>
                </form>
                <p className="text-xs text-muted-foreground mt-3 font-mono">
                  Available: {fmtG(myGravity)} G
                  {rateKnown
                    ? ` (≈ ${selectedSymbol}${fmtG((myGravity * GRAVITY_RATE) / fxRate)})`
                    : ""}{" "}
                  · 1 G ={" "}
                  {rateKnown ? `${selectedSymbol}${fmtG(GRAVITY_RATE / fxRate)}` : "—"} ·
                  A 1% network fee applies to each transfer.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No wallet is linked to your account yet.
              </p>
            )}
          </CardContent>
        </Card>
        {/* ── END SEND GRAVITY ── */}

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-serif font-bold text-primary">
              Declared Assets
            </h2>
          </div>

          <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
            {isAssetsLoading ? (
              <div className="p-8 space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : assets && assets.length > 0 ? (
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="font-medium text-primary">
                      Asset Type
                    </TableHead>
                    <TableHead className="font-medium text-primary">
                      Description
                    </TableHead>
                    <TableHead className="font-medium text-primary">
                      Declared Value
                    </TableHead>
                    <TableHead className="font-medium text-primary">
                      Status
                    </TableHead>
                    <TableHead className="font-medium text-primary">
                      Date
                    </TableHead>
                    <TableHead className="text-right font-medium text-primary">
                      Action
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.isArray(assets) &&
                    assets.map((asset) => (
                      <TableRow key={asset.id}>
                        <TableCell className="font-medium">
                          {formatAssetType(asset.assetType)}
                        </TableCell>
                        <TableCell>
                          <div
                            className="max-w-[300px] truncate"
                            title={asset.description}
                          >
                            {asset.description}
                          </div>
                          {asset.rejectionReason && (
                            <div className="text-xs text-destructive mt-1 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              {asset.rejectionReason}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-serif">
                          {formatCurrency(asset.claimedValue)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {getStatusBadge(asset.status)}
                            {asset.mintedAt && (
                              <Badge className="bg-cyan-600 hover:bg-cyan-700 w-fit">
                                Minted
                                {asset.gravityIssued != null
                                  ? ` · ${fmtG(asset.gravityIssued)} G`
                                  : ""}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(asset.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          {asset.status === "pending" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => handleDelete(asset.id)}
                              disabled={deleteAsset.isPending}
                              data-testid={`button-delete-asset-${asset.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-12 text-center text-muted-foreground">
                <p>No assets declared yet.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
