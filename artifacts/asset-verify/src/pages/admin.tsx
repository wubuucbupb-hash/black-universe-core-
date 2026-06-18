import { useAuth } from "@/components/auth-provider";
import { Layout } from "@/components/layout";
import { useLocation } from "wouter";
import {
  useGetAdminStats,
  getGetAdminStatsQueryKey,
  useAdminListAssets,
  getAdminListAssetsQueryKey,
  useApproveAsset,
  useRejectAsset,
  useDepositAsset,
  useMintAsset,
  useAdminListUsers,
  getAdminListUsersQueryKey,
} from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { GRAVITY_RATE } from "@/lib/currency";
import { useCurrency, CurrencySelect } from "@/components/currency-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2,
  XCircle,
  Users,
  LayoutList,
  DollarSign,
  Clock,
  ShieldCheck,
  FileText,
  Hash,
  Archive,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { useState, useEffect } from "react";

const VALID_TABS = ["matrix", "custody", "txns", "assets", "users", "gateway"];
function tabFromHash(): string {
  const h = window.location.hash.replace(/^#/, "");
  return VALID_TABS.includes(h) ? h : "matrix";
}

export default function Admin() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { format } = useCurrency();

  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [gwRejectId, setGwRejectId] = useState<number | null>(null);
  const [gwRejectReason, setGwRejectReason] = useState("");
  const [gwForm, setGwForm] = useState({
    bankName: "",
    accountName: "",
    accountNumber: "",
    ifsc: "",
    upiId: "",
    instructions: "",
  });
  const [gwSaving, setGwSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(tabFromHash);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    kind: "account" | "user" | "asset";
    id: string;
    label: string;
  } | null>(null);
  const [confirmReverse, setConfirmReverse] = useState<{
    id: number;
    label: string;
  } | null>(null);

  useEffect(() => {
    const onHash = () => setActiveTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const handleTabChange = (v: string) => {
    setActiveTab(v);
    if (window.location.hash.replace(/^#/, "") !== v) {
      window.history.replaceState(null, "", `#${v}`);
    }
  };

  const { data: stats, isLoading: isStatsLoading } = useGetAdminStats({
    query: {
      queryKey: getGetAdminStatsQueryKey(),
      enabled: user?.role === "admin",
    },
  });

  const { data: assets, isLoading: isAssetsLoading } = useAdminListAssets(
    {},
    {
      query: {
        queryKey: getAdminListAssetsQueryKey(),
        enabled: user?.role === "admin",
      },
    },
  );

  const { data: users, isLoading: isUsersLoading } = useAdminListUsers({
    query: {
      queryKey: getAdminListUsersQueryKey(),
      enabled: user?.role === "admin",
    },
  });

  const approveAsset = useApproveAsset();
  const rejectAsset = useRejectAsset();
  const depositAsset = useDepositAsset();
  const mintAsset = useMintAsset();

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  const { data: matrixAccounts } = useQuery({
    queryKey: ["admin-matrix-accounts"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/admin/accounts`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: user?.role === "admin",
    refetchInterval: 6000,
  });

  const { data: custodyData } = useQuery({
    queryKey: ["admin-custody-vault"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/custody/vault`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: user?.role === "admin",
    refetchInterval: 8000,
  });

  const { data: matrixTxns } = useQuery({
    queryKey: ["admin-matrix-txns"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/matrix/logs`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: user?.role === "admin",
    refetchInterval: 6000,
  });

  const { data: gravityRequests } = useQuery({
    queryKey: ["admin-gravity-purchases"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/admin/gravity-purchases`, {
        credentials: "include",
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: user?.role === "admin",
    refetchInterval: 6000,
  });

  const { data: gatewaySettingsData } = useQuery({
    queryKey: ["admin-gateway-settings"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/matrix/gateway-settings`, {
        credentials: "include",
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: user?.role === "admin",
  });

  useEffect(() => {
    const s = gatewaySettingsData?.settings;
    if (s) {
      setGwForm({
        bankName: s.bankName ?? "",
        accountName: s.accountName ?? "",
        accountNumber: s.accountNumber ?? "",
        ifsc: s.ifsc ?? "",
        upiId: s.upiId ?? "",
        instructions: s.instructions ?? "",
      });
    }
  }, [gatewaySettingsData]);

  function fmtG(n: number | string) {
    return Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const SYSTEM_CORES = ["000000000000","000000000001","000000000002","111111111111","222222222222","333333333333","444444444444","555555555555","666666666666","777777777777","888888888888","999999999999"];
  const allAccounts: any[] = matrixAccounts?.accounts ?? [];
  const custodyEntries: any[] = custodyData?.entries ?? [];
  const txnLogs: any[] = matrixTxns?.logs ?? [];
  const gravityReqs: any[] = gravityRequests?.requests ?? [];

  if (isAuthLoading) return null;

  const handleApprove = (id: number) => {
    approveAsset.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getAdminListAssetsQueryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: getGetAdminStatsQueryKey(),
          });
          toast({
            title: "Asset Approved",
            description: "The asset has been officially verified.",
          });
        },
        onError: (err: unknown) => {
          const msg = (err as { error?: string })?.error;
          toast({
            title: "Error",
            description: msg || "Failed to approve asset.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleReject = () => {
    if (!rejectId || rejectReason.length < 5) return;

    rejectAsset.mutate(
      { id: rejectId, data: { reason: rejectReason } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getAdminListAssetsQueryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: getGetAdminStatsQueryKey(),
          });
          setRejectId(null);
          setRejectReason("");
          toast({
            title: "Asset Rejected",
            description: "The asset has been rejected.",
          });
        },
        onError: (err: unknown) => {
          const msg = (err as { error?: string })?.error;
          toast({
            title: "Error",
            description: msg || "Failed to reject asset.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleDeposit = (id: number) => {
    depositAsset.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getAdminListAssetsQueryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: getGetAdminStatsQueryKey(),
          });
          toast({
            title: "Asset Deposited & Minted",
            description: "Gravity has been issued and locked into custody.",
          });
        },
        onError: (err: unknown) => {
          const msg = (err as { error?: string })?.error;
          toast({
            title: "Error",
            description: msg || "Failed to deposit asset.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleMint = (id: number) => {
    mintAsset.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getAdminListAssetsQueryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: getGetAdminStatsQueryKey(),
          });
          queryClient.invalidateQueries({ queryKey: ["admin-matrix-accounts"] });
          queryClient.invalidateQueries({ queryKey: ["admin-matrix-txns"] });
          toast({
            title: "Gravity Minted",
            description:
              "Matching Gravity created in System Core (1:1) and distributed; Growth 25% sent to the Growth Pool.",
          });
        },
        onError: (err: unknown) => {
          const msg = (err as { error?: string })?.error;
          toast({
            title: "Mint Failed",
            description: msg || "Failed to mint Gravity for this asset.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const invalidateManagement = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-matrix-accounts"] });
    queryClient.invalidateQueries({ queryKey: ["admin-matrix-txns"] });
    queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getAdminListAssetsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() });
  };

  const runAdminAction = async (
    key: string,
    path: string,
    method: "POST" | "DELETE",
    okTitle: string,
    okDesc: string,
  ) => {
    setBusyKey(key);
    try {
      const res = await fetch(`${BASE}${path}`, {
        method,
        credentials: "include",
      });
      if (!res.ok) {
        let msg = "Action failed.";
        try {
          const j = await res.json();
          msg = j.error ?? msg;
        } catch {
          /* non-JSON response */
        }
        throw new Error(msg);
      }
      invalidateManagement();
      toast({ title: okTitle, description: okDesc });
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Action failed.",
        variant: "destructive",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const archiveAccount = (acc: string) =>
    runAdminAction(
      `acc:${acc}`,
      `/api/admin/accounts/${acc}/archive`,
      "POST",
      "Account Archived",
      `Account ${acc} archived. Its data stays safe in the database.`,
    );
  const restoreAccount = (acc: string) =>
    runAdminAction(
      `acc:${acc}`,
      `/api/admin/accounts/${acc}/restore`,
      "POST",
      "Account Restored",
      `Account ${acc} is active again.`,
    );
  const archiveUser = (id: number) =>
    runAdminAction(
      `usr:${id}`,
      `/api/admin/users/${id}/archive`,
      "POST",
      "User Archived",
      "User archived. Their data stays safe in the database.",
    );
  const restoreUser = (id: number) =>
    runAdminAction(
      `usr:${id}`,
      `/api/admin/users/${id}/restore`,
      "POST",
      "User Restored",
      "User is active again.",
    );

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    const { kind, id } = confirmDelete;
    if (kind === "account") {
      await runAdminAction(
        `acc:${id}`,
        `/api/admin/accounts/${id}`,
        "DELETE",
        "Account Deleted",
        `Account ${id} permanently deleted.`,
      );
    } else if (kind === "asset") {
      await runAdminAction(
        `asset:${id}`,
        `/api/admin/assets/${id}`,
        "DELETE",
        "Asset Deleted",
        "Asset permanently removed from the registry.",
      );
    } else {
      await runAdminAction(
        `usr:${id}`,
        `/api/admin/users/${id}`,
        "DELETE",
        "User Deleted",
        "User permanently deleted.",
      );
    }
    setConfirmDelete(null);
  };

  const handleConfirmReverse = async () => {
    if (!confirmReverse) return;
    await runAdminAction(
      `tx:${confirmReverse.id}`,
      `/api/admin/transactions/${confirmReverse.id}/reverse`,
      "POST",
      "Transaction Reversed",
      "Gravity returned and the transaction marked reversed.",
    );
    setConfirmReverse(null);
  };

  const runGravityAction = async (
    id: number,
    path: string,
    body: object,
    okTitle: string,
    okDesc: string,
  ) => {
    setBusyKey(`gw:${id}`);
    try {
      const res = await fetch(`${BASE}${path}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let msg = "Action failed.";
        try {
          const j = await res.json();
          msg = j.error ?? msg;
        } catch {
          /* non-JSON response */
        }
        throw new Error(msg);
      }
      queryClient.invalidateQueries({ queryKey: ["admin-gravity-purchases"] });
      queryClient.invalidateQueries({ queryKey: ["admin-matrix-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["admin-matrix-txns"] });
      toast({ title: okTitle, description: okDesc });
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Action failed.",
        variant: "destructive",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const approveGravity = (id: number) =>
    runGravityAction(
      id,
      `/api/admin/gravity-purchases/${id}/approve`,
      {},
      "Gravity Credited",
      "Buyer's Gravity has been credited from the Reserve pool.",
    );

  const handleGwReject = () => {
    if (!gwRejectId) return;
    const id = gwRejectId;
    runGravityAction(
      id,
      `/api/admin/gravity-purchases/${id}/reject`,
      { reason: gwRejectReason },
      "Request Rejected",
      "The purchase request was rejected.",
    );
    setGwRejectId(null);
    setGwRejectReason("");
  };

  const saveGatewaySettings = async () => {
    setGwSaving(true);
    try {
      const res = await fetch(`${BASE}/api/admin/gateway-settings`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(gwForm),
      });
      if (!res.ok) {
        let msg = "Save failed.";
        try {
          const j = await res.json();
          msg = j.error ?? msg;
        } catch {
          /* non-JSON response */
        }
        throw new Error(msg);
      }
      queryClient.invalidateQueries({ queryKey: ["admin-gateway-settings"] });
      queryClient.invalidateQueries({ queryKey: ["gateway-settings"] });
      toast({ title: "Saved", description: "Bank / UPI details updated." });
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Save failed.",
        variant: "destructive",
      });
    } finally {
      setGwSaving(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-600">Verified</Badge>;
      case "minted":
        return <Badge className="bg-purple-600">Minted</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return (
          <Badge
            variant="secondary"
            className="bg-accent/20 text-accent-foreground border-accent/30"
          >
            Pending
          </Badge>
        );
    }
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <ShieldCheck className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-serif font-bold text-primary">
            Authority Console
          </h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Users
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isStatsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-serif font-bold">
                  {stats?.totalUsers || 0}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending Verifications
              </CardTitle>
              <Clock className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              {isStatsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-serif font-bold text-accent">
                  {stats?.pendingAssets || 0}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Verified Value
              </CardTitle>
              <LayoutList className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isStatsLoading ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <div className="text-2xl font-serif font-bold text-green-600">
                  {formatCurrency(stats?.totalVerifiedValue || 0)}
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-yellow-50 to-amber-100 border-amber-300 shadow-md">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold text-amber-800">
                Founder Fee Earned (1%)
              </CardTitle>
              <DollarSign className="h-5 w-5 text-amber-600" />
            </CardHeader>
            <CardContent>
              {isStatsLoading ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <>
                  <div className="text-2xl font-serif font-bold text-amber-900">
                    {formatCurrency(stats?.totalFeesEarned || 0)}
                  </div>
                  <p className="text-xs text-amber-700 mt-1">
                    1% of all approved asset value
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="mb-4 flex-wrap h-auto gap-1">
            <TabsTrigger value="matrix">🌌 Matrix Accounts</TabsTrigger>
            <TabsTrigger value="custody">🏛️ Custody Ledger</TabsTrigger>
            <TabsTrigger value="txns">⚡ Transactions</TabsTrigger>
            <TabsTrigger value="assets">Asset Registry</TabsTrigger>
            <TabsTrigger value="users">Portal Users</TabsTrigger>
            <TabsTrigger value="gateway">💱 Gravity Exchange</TabsTrigger>
          </TabsList>

          <TabsContent
            value="assets"
            className="rounded-xl overflow-hidden border border-zinc-800"
          >
            <div className="bg-black px-4 py-2 flex items-center justify-between gap-2 border-b border-zinc-800">
              <span className="text-cyan-400 text-xs font-mono font-bold tracking-widest">
                📜 ASSET REGISTRY — {assets?.length ?? 0} DECLARATIONS
              </span>
              <CurrencySelect />
            </div>
            <div className="bg-[#0a0a0a] overflow-x-auto">
              {isAssetsLoading ? (
                <div className="p-8 space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : !assets || assets.length === 0 ? (
                <div className="p-8 text-center text-zinc-600 font-mono text-sm">
                  No asset declarations yet.
                </div>
              ) : (
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-500">
                      <th className="text-left px-4 py-2">CLIENT</th>
                      <th className="text-left px-4 py-2">ASSET / DESCRIPTION</th>
                      <th className="text-left px-4 py-2">DOCUMENTS</th>
                      <th className="text-right px-4 py-2">DECLARED VALUE</th>
                      <th className="text-left px-4 py-2">STATUS</th>
                      <th className="text-left px-4 py-2">DATE</th>
                      <th className="text-right px-4 py-2">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assets.map((asset) => (
                      <tr key={asset.id} className="border-b border-zinc-900">
                        <td className="px-4 py-2 align-top">
                          <div className="text-white font-bold">
                            {asset.userName}
                          </div>
                          <div className="text-zinc-500">{asset.userEmail}</div>
                        </td>
                        <td className="px-4 py-2 align-top">
                          <div className="text-cyan-400 font-bold">
                            {asset.assetType.toUpperCase()}
                          </div>
                          <div
                            className="text-zinc-400 max-w-[240px] truncate"
                            title={asset.description}
                          >
                            {asset.description}
                          </div>
                        </td>
                        <td className="px-4 py-2 align-top">
                          {(asset.documentUrls &&
                            asset.documentUrls.length > 0) ||
                          asset.documentNote ? (
                            <div className="flex flex-col gap-1">
                              {asset.documentUrls?.map((path, i) => (
                                <a
                                  key={path}
                                  href={`${BASE}/api/storage${path}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 hover:underline"
                                  data-testid={`link-doc-${asset.id}-${i}`}
                                >
                                  <FileText className="h-3 w-3" /> Doc {i + 1}
                                </a>
                              ))}
                              {asset.documentNote && (
                                <span
                                  className="inline-flex items-center gap-1 text-zinc-300"
                                  title={asset.documentNote}
                                  data-testid={`text-doc-ref-${asset.id}`}
                                >
                                  <Hash className="h-3 w-3 flex-shrink-0 text-zinc-500" />
                                  <span className="truncate max-w-[200px]">
                                    {asset.documentNote}
                                  </span>
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-zinc-700">— none —</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right text-green-400 font-bold align-top">
                          {format(Number(asset.claimedValue) / GRAVITY_RATE)}
                        </td>
                        <td className="px-4 py-2 align-top">
                          <div className="flex flex-col gap-1">
                            {getStatusBadge(asset.status)}
                            {(asset.status === "approved" ||
                              asset.status === "minted") && (
                              <Badge className="bg-cyan-600 hover:bg-cyan-700 w-fit">
                                🔒 Vault-Locked · {format(Number(asset.claimedValue) / GRAVITY_RATE)}
                              </Badge>
                            )}
                            {asset.status === "minted" &&
                              asset.gravityIssued != null && (
                                <Badge className="bg-purple-600 hover:bg-purple-700 w-fit">
                                  🌌 Minted · {Number(asset.gravityIssued).toFixed(2)} G
                                </Badge>
                              )}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-zinc-600 align-top">
                          {formatDate(asset.createdAt)}
                        </td>
                        <td className="px-4 py-2 text-right align-top">
                          <div className="flex justify-end items-center gap-2 flex-wrap">
                            {asset.status === "approved" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-purple-500/40 text-purple-300 hover:text-purple-200 hover:bg-purple-500/10"
                                onClick={() => handleMint(asset.id)}
                                disabled={mintAsset.isPending}
                                data-testid={`button-mint-${asset.id}`}
                              >
                                🌌 Mint Gravity
                              </Button>
                            )}
                            {asset.status === "minted" && (
                              <span className="text-purple-300 text-xs font-mono">
                                🌌 Minted
                                {asset.gravityIssued != null
                                  ? ` · ${Number(asset.gravityIssued).toFixed(2)} G`
                                  : ""}
                              </span>
                            )}
                            {asset.status === "pending" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-green-500/40 text-green-400 hover:text-green-300 hover:bg-green-500/10"
                                  onClick={() => handleApprove(asset.id)}
                                  disabled={approveAsset.isPending}
                                  data-testid={`button-approve-${asset.id}`}
                                >
                                  <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                                </Button>

                                <Dialog
                                  open={rejectId === asset.id}
                                  onOpenChange={(open) =>
                                    !open && setRejectId(null)
                                  }
                                >
                                  <DialogTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="border-red-500/40 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                      onClick={() => setRejectId(asset.id)}
                                      data-testid={`button-reject-${asset.id}`}
                                    >
                                      <XCircle className="h-4 w-4 mr-1" /> Reject
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>
                                        Reject Verification
                                      </DialogTitle>
                                    </DialogHeader>
                                    <div className="py-4">
                                      <Textarea
                                        placeholder="State the reason for rejection (required, min 5 chars)..."
                                        value={rejectReason}
                                        onChange={(e) =>
                                          setRejectReason(e.target.value)
                                        }
                                        data-testid="input-reject-reason"
                                      />
                                    </div>
                                    <DialogFooter>
                                      <Button
                                        variant="outline"
                                        onClick={() => setRejectId(null)}
                                      >
                                        Cancel
                                      </Button>
                                      <Button
                                        variant="destructive"
                                        onClick={handleReject}
                                        disabled={
                                          rejectReason.length < 5 ||
                                          rejectAsset.isPending
                                        }
                                        data-testid="button-confirm-reject"
                                      >
                                        Confirm Rejection
                                      </Button>
                                    </DialogFooter>
                                  </DialogContent>
                                </Dialog>
                              </>
                            )}
                            {(asset.status === "pending" ||
                              asset.status === "rejected") && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busyKey === `asset:${asset.id}`}
                                className="border-red-500/40 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                onClick={() =>
                                  setConfirmDelete({
                                    kind: "asset",
                                    id: String(asset.id),
                                    label: `${asset.assetType.toUpperCase()} — ${asset.userName}`,
                                  })
                                }
                                data-testid={`button-delete-asset-${asset.id}`}
                              >
                                <Trash2 className="h-4 w-4 mr-1" /> Delete
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </TabsContent>

          <TabsContent
            value="users"
            className="rounded-xl overflow-hidden border border-zinc-800"
          >
            <div className="bg-black px-4 py-2 flex items-center gap-2 border-b border-zinc-800">
              <span className="text-cyan-400 text-xs font-mono font-bold tracking-widest">
                👤 PORTAL USERS — {users?.length ?? 0} ACCOUNTS
              </span>
            </div>
            <div className="bg-[#0a0a0a] overflow-x-auto">
              {isUsersLoading ? (
                <div className="p-8 space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : !users || users.length === 0 ? (
                <div className="p-8 text-center text-zinc-600 font-mono text-sm">
                  No registered users yet.
                </div>
              ) : (
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-500">
                      <th className="text-left px-4 py-2">NAME</th>
                      <th className="text-left px-4 py-2">EMAIL</th>
                      <th className="text-left px-4 py-2">ROLE</th>
                      <th className="text-right px-4 py-2">TOTAL ASSETS</th>
                      <th className="text-right px-4 py-2">
                        TOTAL CLAIMED VALUE
                      </th>
                      <th className="text-left px-4 py-2">JOINED</th>
                      <th className="text-right px-4 py-2">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const isAdmin = u.role === "admin";
                      const isArchived = !!(u as { archivedAt?: string | null })
                        .archivedAt;
                      const busy = busyKey === `usr:${u.id}`;
                      return (
                      <tr
                        key={u.id}
                        className={`border-b border-zinc-900 ${isArchived ? "opacity-50" : ""}`}
                      >
                        <td className="px-4 py-2 text-white font-bold">
                          {u.name}
                          {isArchived && (
                            <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400">
                              ARCHIVED
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-zinc-400">{u.email}</td>
                        <td className="px-4 py-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              u.role === "admin"
                                ? "bg-cyan-500/20 text-cyan-400"
                                : "bg-zinc-700 text-zinc-300"
                            }`}
                          >
                            {u.role.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right text-zinc-300">
                          {u.assetCount}
                        </td>
                        <td className="px-4 py-2 text-right text-green-400 font-bold">
                          {formatCurrency(u.totalClaimedValue)}
                        </td>
                        <td className="px-4 py-2 text-zinc-600">
                          {formatDate(u.createdAt)}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {isAdmin ? (
                            <span className="text-zinc-700 text-[10px] font-bold">
                              PROTECTED
                            </span>
                          ) : (
                            <div className="flex justify-end gap-2">
                              {isArchived ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                  className="border-cyan-500/40 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
                                  onClick={() => restoreUser(u.id)}
                                  data-testid={`button-restore-user-${u.id}`}
                                >
                                  <RotateCcw className="h-4 w-4 mr-1" /> Restore
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                  className="border-amber-500/40 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                                  onClick={() => archiveUser(u.id)}
                                  data-testid={`button-archive-user-${u.id}`}
                                >
                                  <Archive className="h-4 w-4 mr-1" /> Archive
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                className="border-red-500/40 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                onClick={() =>
                                  setConfirmDelete({
                                    kind: "user",
                                    id: String(u.id),
                                    label: u.name ?? `User #${u.id}`,
                                  })
                                }
                                data-testid={`button-delete-user-${u.id}`}
                              >
                                <Trash2 className="h-4 w-4 mr-1" /> Delete
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </TabsContent>
          {/* ── MATRIX ACCOUNTS TAB ── */}
          <TabsContent value="matrix" className="rounded-xl overflow-hidden border border-zinc-800">
            <div className="bg-black px-4 py-2 flex items-center gap-2 border-b border-zinc-800">
              <span className="text-cyan-400 text-xs font-mono font-bold tracking-widest">🌌 MATRIX ACCOUNTS DATABASE — {allAccounts.length} RECORDS</span>
            </div>
            <div className="bg-[#0a0a0a] overflow-x-auto">
              {allAccounts.length === 0 ? (
                <div className="p-8 text-center text-zinc-600 font-mono text-sm">Loading accounts...</div>
              ) : (
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-500">
                      <th className="text-left px-4 py-2">ACCOUNT #</th>
                      <th className="text-left px-4 py-2">NAME</th>
                      <th className="text-left px-4 py-2">TYPE</th>
                      <th className="text-left px-4 py-2">CLUSTER</th>
                      <th className="text-right px-4 py-2">GRAVITY BALANCE</th>
                      <th className="text-right px-4 py-2">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allAccounts.map((acc: any) => {
                      const isSys = SYSTEM_CORES.includes(acc.accountNumber);
                      const isFounder = acc.accountNumber === "111111111111";
                      const isArchived = !!acc.archivedAt;
                      const busy = busyKey === `acc:${acc.accountNumber}`;
                      return (
                        <tr key={acc.accountNumber} className={`border-b border-zinc-900 ${isArchived ? "opacity-50" : ""} ${isFounder ? "bg-emerald-500/5" : isSys ? "bg-zinc-900/40" : "bg-cyan-500/5"}`}>
                          <td className={`px-4 py-2 font-bold ${isFounder ? "text-emerald-400" : isSys ? "text-red-400" : "text-cyan-400"}`}>{acc.accountNumber}</td>
                          <td className="px-4 py-2 text-white">
                            {acc.name}
                            {isArchived && (
                              <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400">ARCHIVED</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-zinc-400">{acc.type}</td>
                          <td className="px-4 py-2 text-zinc-500">{acc.cluster ?? "—"}</td>
                          <td className={`px-4 py-2 text-right font-bold ${Number(acc.gravityBalance) > 0 ? "text-green-400" : "text-zinc-600"}`}>
                            {fmtG(acc.gravityBalance)} G
                          </td>
                          <td className="px-4 py-2 text-right">
                            {isSys ? (
                              <span className="text-zinc-700 text-[10px] font-bold">SYSTEM</span>
                            ) : (
                              <div className="flex justify-end gap-2">
                                {isArchived ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={busy}
                                    className="border-cyan-500/40 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
                                    onClick={() => restoreAccount(acc.accountNumber)}
                                    data-testid={`button-restore-account-${acc.accountNumber}`}
                                  >
                                    <RotateCcw className="h-4 w-4 mr-1" /> Restore
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={busy}
                                    className="border-amber-500/40 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                                    onClick={() => archiveAccount(acc.accountNumber)}
                                    data-testid={`button-archive-account-${acc.accountNumber}`}
                                  >
                                    <Archive className="h-4 w-4 mr-1" /> Archive
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                  className="border-red-500/40 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                  onClick={() =>
                                    setConfirmDelete({
                                      kind: "account",
                                      id: acc.accountNumber,
                                      label: `${acc.name} (${acc.accountNumber})`,
                                    })
                                  }
                                  data-testid={`button-delete-account-${acc.accountNumber}`}
                                >
                                  <Trash2 className="h-4 w-4 mr-1" /> Delete
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </TabsContent>

          {/* ── CUSTODY LEDGER TAB ── */}
          <TabsContent value="custody" className="rounded-xl overflow-hidden border border-zinc-800">
            <div className="bg-black px-4 py-2 flex items-center gap-2 border-b border-zinc-800">
              <span className="text-yellow-400 text-xs font-mono font-bold tracking-widest">🏛️ CUSTODY LEDGER — {custodyEntries.length} ENTRIES (DECRYPTED)</span>
            </div>
            <div className="bg-[#0a0a0a] overflow-x-auto">
              {custodyEntries.length === 0 ? (
                <div className="p-8 text-center text-zinc-600 font-mono text-sm">No custody entries yet. Lock or escrow assets from the Vault.</div>
              ) : (
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-500">
                      <th className="text-left px-4 py-2">ID</th>
                      <th className="text-left px-4 py-2">ASSET TYPE</th>
                      <th className="text-left px-4 py-2">DESCRIPTION</th>
                      <th className="text-right px-4 py-2">VALUATION</th>
                      <th className="text-left px-4 py-2">STATUS</th>
                      <th className="text-left px-4 py-2">SENDER → RECEIVER</th>
                      <th className="text-left px-4 py-2">DATE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {custodyEntries.map((e: any) => (
                      <tr key={e.id} className="border-b border-zinc-900">
                        <td className="px-4 py-2 text-zinc-500">{e.id}</td>
                        <td className="px-4 py-2 text-cyan-400">{e.assetType ?? "—"}</td>
                        <td className="px-4 py-2 text-zinc-300 max-w-[180px] truncate">{e.description ?? "—"}</td>
                        <td className="px-4 py-2 text-right text-green-400 font-bold">{e.valuation ? fmtG(e.valuation) + " G" : "—"}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${e.status === "LOCKED" ? "bg-yellow-500/20 text-yellow-400" : e.status === "RELEASED" ? "bg-green-500/20 text-green-400" : "bg-zinc-700 text-zinc-400"}`}>
                            {e.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-zinc-500">{e.senderAccount ?? "—"} {e.receiverAccount ? `→ ${e.receiverAccount}` : ""}</td>
                        <td className="px-4 py-2 text-zinc-600">{e.createdAt ? new Date(e.createdAt).toLocaleDateString("en-IN") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </TabsContent>

          {/* ── TRANSACTIONS TAB ── */}
          <TabsContent value="txns" className="rounded-xl overflow-hidden border border-zinc-800">
            <div className="bg-black px-4 py-2 flex items-center justify-between gap-2 border-b border-zinc-800">
              <span className="text-cyan-400 text-xs font-mono font-bold tracking-widest">⚡ MATRIX TRANSACTION LOG — {txnLogs.length} RECORDS</span>
              <CurrencySelect className="bg-black border border-zinc-700 text-zinc-300 text-[10px] font-mono rounded px-1.5 py-0.5 focus:border-cyan-500 focus:outline-none max-w-[150px]" />
            </div>
            <div className="bg-[#0a0a0a] overflow-x-auto">
              {txnLogs.length === 0 ? (
                <div className="p-8 text-center text-zinc-600 font-mono text-sm">No transactions yet.</div>
              ) : (
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-500">
                      <th className="text-left px-4 py-2">ID</th>
                      <th className="text-left px-4 py-2">TYPE</th>
                      <th className="text-left px-4 py-2">FROM</th>
                      <th className="text-left px-4 py-2">TO</th>
                      <th className="text-right px-4 py-2">AMOUNT</th>
                      <th className="text-left px-4 py-2">NOTE</th>
                      <th className="text-left px-4 py-2">DATE</th>
                      <th className="text-left px-4 py-2">ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txnLogs.map((t: any) => (
                      <tr key={t.id} className="border-b border-zinc-900">
                        <td className="px-4 py-2 text-zinc-500">{t.id}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${t.txType === "MINT" ? "bg-cyan-500/20 text-cyan-400" : t.txType === "P2P_TRANSFER" ? "bg-purple-500/20 text-purple-400" : t.txType === "REVERSAL" ? "bg-amber-500/20 text-amber-400" : t.txType === "DEPOSIT" ? "bg-green-500/20 text-green-400" : "bg-zinc-700 text-zinc-400"}`}>
                            {t.txType ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-zinc-400">{t.fromAccount ?? "SYSTEM"}</td>
                        <td className="px-4 py-2 text-zinc-400">{t.toAccount ?? "—"}</td>
                        <td className="px-4 py-2 text-right text-green-400 font-bold tabular-nums">{format(t.amount ?? 0)}</td>
                        <td className="px-4 py-2 text-zinc-500 max-w-[160px] truncate">{t.description ?? "—"}</td>
                        <td className="px-4 py-2 text-zinc-600">{t.createdAt ? new Date(t.createdAt).toLocaleDateString("en-IN") : "—"}</td>
                        <td className="px-4 py-2">
                          {t.reversedAt ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400">REVERSED</span>
                          ) : t.txType === "REVERSAL" || !t.amount || Number(t.amount) <= 0 ? (
                            <span className="text-zinc-700">—</span>
                          ) : (
                            <button
                              onClick={() => setConfirmReverse({ id: t.id, label: `Tx #${t.id} (${t.txType}) — ${fmtG(t.amount)} G` })}
                              disabled={busyKey === `tx:${t.id}`}
                              className="px-2 py-1 rounded bg-amber-600/80 hover:bg-amber-600 text-white text-[10px] font-bold disabled:opacity-50"
                            >
                              {busyKey === `tx:${t.id}` ? "..." : "Reverse"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </TabsContent>

          <TabsContent value="gateway" className="space-y-4">
            {/* Bank / UPI settings */}
            <div className="rounded-xl border border-zinc-800 p-5 bg-zinc-950">
              <h3 className="text-cyan-400 font-bold font-mono text-sm tracking-widest mb-1">
                🏦 INR PAYMENT DETAILS
              </h3>
              <p className="text-zinc-600 text-[11px] font-mono mb-4">
                Citizens see these details when exchanging INR for Gravity.
                Approved requests credit Gravity at ₹
                {GRAVITY_RATE.toLocaleString("en-IN")} = 1 G from the Reserve
                pool.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(
                  [
                    ["bankName", "Bank Name"],
                    ["accountName", "Account Holder Name"],
                    ["accountNumber", "Account Number"],
                    ["ifsc", "IFSC Code"],
                    ["upiId", "UPI ID"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <label className="text-zinc-400 text-xs font-mono">
                      {label}
                    </label>
                    <input
                      value={gwForm[key]}
                      onChange={(e) =>
                        setGwForm((f) => ({ ...f, [key]: e.target.value }))
                      }
                      className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                    />
                  </div>
                ))}
              </div>
              <div className="mt-3">
                <label className="text-zinc-400 text-xs font-mono">
                  Instructions (optional)
                </label>
                <Textarea
                  value={gwForm.instructions}
                  onChange={(e) =>
                    setGwForm((f) => ({ ...f, instructions: e.target.value }))
                  }
                  className="w-full mt-1 bg-black border-zinc-700 text-white text-sm"
                  rows={2}
                />
              </div>
              <Button
                onClick={saveGatewaySettings}
                disabled={gwSaving}
                className="mt-4 bg-cyan-600 hover:bg-cyan-600/90 text-white"
              >
                {gwSaving ? "Saving..." : "Save Payment Details"}
              </Button>
            </div>

            {/* Requests queue */}
            <div className="rounded-xl overflow-hidden border border-zinc-800">
              <div className="bg-zinc-950 px-4 py-3 border-b border-zinc-800">
                <h3 className="text-cyan-400 font-bold font-mono text-sm tracking-widest">
                  ⏳ GRAVITY EXCHANGE REQUESTS
                </h3>
              </div>
              {gravityReqs.length === 0 ? (
                <div className="p-8 text-center text-zinc-600 font-mono text-sm">
                  No purchase requests yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-500">
                        <th className="text-left px-4 py-2">CITIZEN</th>
                        <th className="text-right px-4 py-2">INR</th>
                        <th className="text-right px-4 py-2">GRAVITY</th>
                        <th className="text-left px-4 py-2">PROOF</th>
                        <th className="text-left px-4 py-2">REF</th>
                        <th className="text-left px-4 py-2">STATUS</th>
                        <th className="text-left px-4 py-2">DATE</th>
                        <th className="text-right px-4 py-2">ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gravityReqs.map((r) => (
                        <tr key={r.id} className="border-b border-zinc-900">
                          <td className="px-4 py-2 align-top">
                            <div className="text-white font-bold">
                              {r.userName ?? "—"}
                            </div>
                            <div className="text-zinc-500">{r.userEmail}</div>
                            {r.accountNumber && (
                              <div className="text-zinc-600">
                                {r.accountNumber}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2 align-top text-right text-zinc-300">
                            ₹{fmtG(r.inrAmount)}
                          </td>
                          <td className="px-4 py-2 align-top text-right text-cyan-400 font-bold">
                            {fmtG(r.gravityAmount)}
                          </td>
                          <td className="px-4 py-2 align-top">
                            <div className="flex flex-col gap-1">
                              {(r.proofUrls ?? []).map(
                                (path: string, i: number) => (
                                  <a
                                    key={path}
                                    href={`${BASE}/api/storage${path}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 hover:underline"
                                  >
                                    <FileText className="h-3 w-3" /> Proof {i + 1}
                                  </a>
                                ),
                              )}
                            </div>
                          </td>
                          <td
                            className="px-4 py-2 align-top text-zinc-400 max-w-[120px] truncate"
                            title={r.reference ?? ""}
                          >
                            {r.reference ?? "—"}
                          </td>
                          <td className="px-4 py-2 align-top">
                            {r.status === "approved" ? (
                              <Badge className="bg-green-600">Approved</Badge>
                            ) : r.status === "rejected" ? (
                              <Badge variant="destructive">Rejected</Badge>
                            ) : (
                              <Badge className="bg-yellow-600">Pending</Badge>
                            )}
                            {r.rejectionReason && (
                              <div className="text-zinc-600 mt-1 max-w-[140px]">
                                {r.rejectionReason}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2 align-top text-zinc-500">
                            {formatDate(r.createdAt)}
                          </td>
                          <td className="px-4 py-2 align-top text-right">
                            {r.status === "pending" ? (
                              <div className="flex gap-2 justify-end">
                                <Button
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-600/90 text-white h-7"
                                  disabled={busyKey === `gw:${r.id}`}
                                  onClick={() => approveGravity(r.id)}
                                >
                                  <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                                </Button>
                                <Dialog
                                  open={gwRejectId === r.id}
                                  onOpenChange={(open) =>
                                    !open && setGwRejectId(null)
                                  }
                                >
                                  <DialogTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      className="h-7"
                                      onClick={() => setGwRejectId(r.id)}
                                    >
                                      <XCircle className="h-3 w-3 mr-1" /> Reject
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>
                                        Reject purchase request
                                      </DialogTitle>
                                    </DialogHeader>
                                    <Textarea
                                      placeholder="Reason (optional)"
                                      value={gwRejectReason}
                                      onChange={(e) =>
                                        setGwRejectReason(e.target.value)
                                      }
                                    />
                                    <DialogFooter>
                                      <Button
                                        variant="outline"
                                        onClick={() => setGwRejectId(null)}
                                      >
                                        Cancel
                                      </Button>
                                      <Button
                                        variant="destructive"
                                        onClick={handleGwReject}
                                        disabled={busyKey === `gw:${r.id}`}
                                      >
                                        Reject request
                                      </Button>
                                    </DialogFooter>
                                  </DialogContent>
                                </Dialog>
                              </div>
                            ) : (
                              <span className="text-zinc-600">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>

        </Tabs>

        <Dialog
          open={!!confirmDelete}
          onOpenChange={(open) => !open && setConfirmDelete(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Permanently delete?</DialogTitle>
            </DialogHeader>
            <div className="py-2 text-sm text-zinc-400">
              <span className="text-white font-bold">
                {confirmDelete?.label}
              </span>{" "}
              {confirmDelete?.kind === "asset" ? (
                <>
                  will be permanently removed from the asset registry. This
                  cannot be undone.
                </>
              ) : (
                <>
                  and all of its data (assets, custody entries, gravity balance)
                  will be erased forever. This cannot be undone.
                  <br />
                  <br />
                  If you only want to hide a real user but keep their data, use{" "}
                  <span className="text-amber-400 font-bold">Archive</span>{" "}
                  instead.
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDelete(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmDelete}
                disabled={busyKey !== null}
                data-testid="button-confirm-delete"
              >
                <Trash2 className="h-4 w-4 mr-1" /> Delete permanently
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={!!confirmReverse}
          onOpenChange={(open) => !open && setConfirmReverse(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reverse this transaction?</DialogTitle>
            </DialogHeader>
            <div className="py-2 text-sm text-zinc-400">
              <span className="text-white font-bold">
                {confirmReverse?.label}
              </span>{" "}
              will be reversed: the gravity moves back (payer credited, payee
              debited) and the transaction is marked{" "}
              <span className="text-amber-400 font-bold">REVERSED</span>. A
              reversal entry is added to the log for the audit trail.
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmReverse(null)}>
                Cancel
              </Button>
              <Button
                onClick={handleConfirmReverse}
                disabled={busyKey !== null}
                className="bg-amber-600 hover:bg-amber-600/90 text-white"
              >
                Reverse transaction
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
