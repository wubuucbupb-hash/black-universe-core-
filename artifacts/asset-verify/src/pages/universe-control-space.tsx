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
} from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2,
  XCircle,
  DollarSign,
  Clock,
  Sparkles,
  FileText,
  Hash,
  LayoutList,
} from "lucide-react";
import { useState } from "react";

export default function UniverseControlSpace() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const isAdmin = user?.role === "admin";

  const { data: stats, isLoading: isStatsLoading } = useGetAdminStats({
    query: {
      queryKey: getGetAdminStatsQueryKey(),
      enabled: isAdmin,
    },
  });

  const { data: assets, isLoading: isAssetsLoading } = useAdminListAssets(
    {},
    {
      query: {
        queryKey: getAdminListAssetsQueryKey(),
        enabled: isAdmin,
      },
    },
  );

  const approveAsset = useApproveAsset();
  const rejectAsset = useRejectAsset();
  const depositAsset = useDepositAsset();

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-600">Verified</Badge>;
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
        <div className="flex items-center gap-3 mb-2">
          <Sparkles className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-serif font-bold text-primary">
            Universe Control Space
          </h1>
        </div>
        <p className="text-sm text-muted-foreground mb-8 font-mono tracking-wide">
          Minting · Approve verified assets and issue Gravity
        </p>

        {!isAdmin ? (
          <Card>
            <CardContent className="py-12 text-center space-y-4">
              <p className="text-muted-foreground">
                Universe Control Space minting is reserved for the founder
                console for now. Black Universe citizens will be connected here
                soon.
              </p>
              <Button
                onClick={() => setLocation("/dashboard")}
                className="bg-cyan-600 hover:bg-cyan-500 text-white"
                data-testid="button-ucs-signin"
              >
                Sign in as admin
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Minting stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
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
                    <div className="text-2xl font-serif font-bold text-amber-900">
                      {formatCurrency(stats?.totalFeesEarned || 0)}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Asset Registry — minting */}
            <div className="rounded-xl overflow-hidden border border-zinc-800">
              <div className="bg-black px-4 py-2 flex items-center gap-2 border-b border-zinc-800">
                <span className="text-cyan-400 text-xs font-mono font-bold tracking-widest">
                  📜 ASSET REGISTRY — {assets?.length ?? 0} DECLARATIONS
                </span>
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
                        <th className="text-left px-4 py-2">
                          ASSET / DESCRIPTION
                        </th>
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
                            <div className="text-zinc-500">
                              {asset.userEmail}
                            </div>
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
                            {formatCurrency(asset.claimedValue)}
                          </td>
                          <td className="px-4 py-2 align-top">
                            <div className="flex flex-col gap-1">
                              {getStatusBadge(asset.status)}
                              {asset.mintedAt && (
                                <Badge className="bg-cyan-600 hover:bg-cyan-700 w-fit">
                                  Minted
                                  {asset.gravityIssued != null
                                    ? ` · ${asset.gravityIssued} G`
                                    : ""}
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-zinc-600 align-top">
                            {formatDate(asset.createdAt)}
                          </td>
                          <td className="px-4 py-2 text-right align-top">
                            {asset.status === "approved" && !asset.mintedAt && (
                              <Button
                                size="sm"
                                className="bg-cyan-600 hover:bg-cyan-500 text-white"
                                onClick={() => handleDeposit(asset.id)}
                                disabled={depositAsset.isPending}
                                data-testid={`button-deposit-${asset.id}`}
                              >
                                <DollarSign className="h-4 w-4 mr-1" /> Deposit &
                                Mint
                              </Button>
                            )}
                            {asset.status === "approved" && asset.mintedAt && (
                              <span className="text-cyan-400 text-xs font-mono">
                                ✓ Minted
                              </span>
                            )}
                            {asset.status === "pending" && (
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-green-500/40 text-green-400 hover:text-green-300 hover:bg-green-500/10"
                                  onClick={() => handleApprove(asset.id)}
                                  disabled={approveAsset.isPending}
                                  data-testid={`button-approve-${asset.id}`}
                                >
                                  <CheckCircle2 className="h-4 w-4 mr-1" />{" "}
                                  Approve
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
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
