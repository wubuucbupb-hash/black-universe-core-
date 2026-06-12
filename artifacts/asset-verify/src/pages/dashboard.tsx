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
import { Trash2, AlertCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function Dashboard() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
  const { data: vaultSummary } = useQuery({
    queryKey: ["custody-summary"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/custody/summary`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!user,
    refetchInterval: 10000,
  });

  const { data: matrixData } = useQuery({
    queryKey: ["matrix-accounts"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/matrix/accounts`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!user,
    refetchInterval: 8000,
  });

  const SYSTEM_CORES = ["000000000000","111111111111","222222222222","333333333333","444444444444","555555555555","666666666666","777777777777","888888888888","999999999999"];
  const allAccounts: any[] = matrixData?.accounts ?? [];
  const systemAccounts = allAccounts.filter((a: any) => SYSTEM_CORES.includes(a.accountNumber));
  const citizens = allAccounts.filter((a: any) => !SYSTEM_CORES.includes(a.accountNumber));

  function fmtG(n: number | string) {
    return Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
                Total Declared Value
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isSummaryLoading ? (
                <Skeleton className="h-10 w-32" />
              ) : (
                <div className="text-4xl font-serif font-semibold text-primary">
                  {formatCurrency(summary?.totalClaimedValue || 0)}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Verified Value
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isSummaryLoading ? (
                <Skeleton className="h-10 w-32" />
              ) : (
                <div className="text-4xl font-serif font-semibold text-green-600">
                  {formatCurrency(summary?.totalApprovedValue || 0)}
                </div>
              )}
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

        {/* ── BLACK UNIVERSE MATRIX ENGINE WIDGET ── */}
        <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl mb-8 overflow-hidden">
          {/* Widget Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 bg-black">
            <div className="flex items-center gap-2">
              <span className="text-cyan-400 text-base">🌌</span>
              <span className="text-cyan-400 font-bold font-mono text-sm tracking-widest">BLACK UNIVERSE MATRIX ENGINE</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setLocation("/matrix")}
                className="px-3 py-1 text-[11px] font-bold font-mono bg-cyan-500 hover:bg-cyan-400 text-black rounded transition-all"
              >
                OPEN MATRIX →
              </button>
              <button
                onClick={() => setLocation("/vault")}
                className="px-3 py-1 text-[11px] font-bold font-mono bg-yellow-500 hover:bg-yellow-400 text-black rounded transition-all"
              >
                🏛️ VAULT
              </button>
            </div>
          </div>

          {/* Live Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-x divide-zinc-800 border-b border-zinc-800">
            {[
              { label: "SYSTEM POOLS", value: systemAccounts.length, color: "text-cyan-400" },
              { label: "CITIZENS", value: citizens.length, color: "text-white" },
              { label: "VAULT LOCKED", value: vaultSummary?.locked ?? 0, color: "text-yellow-400" },
              { label: "VAULT RELEASED", value: vaultSummary?.released ?? 0, color: "text-emerald-400" },
            ].map((s) => (
              <div key={s.label} className="p-3 text-center">
                <div className="text-zinc-600 text-[9px] font-mono tracking-widest">{s.label}</div>
                <div className={`text-xl font-bold font-mono ${s.color} mt-0.5`}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Pool Balances Grid */}
          <div className="p-4">
            <div className="text-zinc-600 text-[10px] font-mono tracking-widest mb-3">🔒 GENESIS SYSTEM POOLS — LIVE BALANCES</div>
            {systemAccounts.length === 0 ? (
              <div className="text-zinc-700 text-xs font-mono text-center py-4">Loading pool data...</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {systemAccounts.map((acc: any) => {
                  const isFounder = acc.accountNumber === "111111111111";
                  const isSystem = acc.accountNumber === "000000000000";
                  return (
                    <div
                      key={acc.accountNumber}
                      className={`rounded-lg px-3 py-2 border ${isFounder ? "border-emerald-500/40 bg-emerald-500/5" : isSystem ? "border-red-500/30 bg-red-500/5" : "border-zinc-800 bg-zinc-900/50"}`}
                    >
                      <div className={`text-[9px] font-mono font-bold tracking-widest ${isFounder ? "text-emerald-400" : isSystem ? "text-red-400" : "text-cyan-500"}`}>
                        {acc.type.toUpperCase()}
                      </div>
                      <div className="text-white text-xs font-semibold truncate leading-tight mt-0.5">{acc.name.replace("Black Universe — ", "")}</div>
                      <div className="text-zinc-500 text-[10px] font-mono">{acc.accountNumber}</div>
                      <div className={`text-sm font-bold font-mono mt-1 ${Number(acc.gravityBalance) > 0 ? "text-green-400" : "text-zinc-600"}`}>
                        {fmtG(acc.gravityBalance)} G
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Citizens Row */}
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

            {/* Vault Status Banner */}
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
                      ? `${vaultSummary.locked} Locked · ${vaultSummary.released} Released · ${vaultSummary.total} Total Entries`
                      : "Loading..."}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {vaultSummary?.locked > 0 && (
                  <span className="text-yellow-400 font-bold text-xs font-mono border border-yellow-500/40 px-2 py-0.5 rounded">
                    🔒 {vaultSummary.locked} LOCKED
                  </span>
                )}
                <span className="text-zinc-600 text-[10px] font-mono">Open →</span>
              </div>
            </div>
          </div>
        </div>
        {/* ── END MATRIX ENGINE WIDGET ── */}

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
                        <TableCell>{getStatusBadge(asset.status)}</TableCell>
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
