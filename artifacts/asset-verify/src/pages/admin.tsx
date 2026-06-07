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
  useAdminListUsers,
  getAdminListUsersQueryKey,
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
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2,
  XCircle,
  Users,
  LayoutList,
  DollarSign,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";

export default function Admin() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

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

        <Tabs defaultValue="assets" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="assets">Asset Registry</TabsTrigger>
            <TabsTrigger value="users">User Profiles</TabsTrigger>
          </TabsList>

          <TabsContent
            value="assets"
            className="bg-white border rounded-lg shadow-sm"
          >
            {isAssetsLoading ? (
              <div className="p-8 space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="font-medium text-primary">
                      Client
                    </TableHead>
                    <TableHead className="font-medium text-primary">
                      Asset / Description
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
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assets?.map((asset) => (
                    <TableRow key={asset.id}>
                      <TableCell>
                        <div className="font-medium">{asset.userName}</div>
                        <div className="text-xs text-muted-foreground">
                          {asset.userEmail}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {asset.assetType.toUpperCase()}
                        </div>
                        <div
                          className="text-sm max-w-[250px] truncate"
                          title={asset.description}
                        >
                          {asset.description}
                        </div>
                        {asset.documentNote && (
                          <div className="text-xs text-muted-foreground mt-1 truncate max-w-[250px]">
                            Ref: {asset.documentNote}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-serif font-medium">
                        {formatCurrency(asset.claimedValue)}
                      </TableCell>
                      <TableCell>{getStatusBadge(asset.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(asset.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        {asset.status === "pending" && (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
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
                                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => setRejectId(asset.id)}
                                  data-testid={`button-reject-${asset.id}`}
                                >
                                  <XCircle className="h-4 w-4 mr-1" /> Reject
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Reject Verification</DialogTitle>
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent
            value="users"
            className="bg-white border rounded-lg shadow-sm"
          >
            {isUsersLoading ? (
              <div className="p-8 space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="font-medium text-primary">
                      Name
                    </TableHead>
                    <TableHead className="font-medium text-primary">
                      Email
                    </TableHead>
                    <TableHead className="font-medium text-primary">
                      Role
                    </TableHead>
                    <TableHead className="font-medium text-primary">
                      Total Assets
                    </TableHead>
                    <TableHead className="font-medium text-primary">
                      Total Claimed Value
                    </TableHead>
                    <TableHead className="font-medium text-primary">
                      Joined
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users?.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>
                        <Badge
                          variant={u.role === "admin" ? "default" : "outline"}
                        >
                          {u.role}
                        </Badge>
                      </TableCell>
                      <TableCell>{u.assetCount}</TableCell>
                      <TableCell className="font-serif">
                        {formatCurrency(u.totalClaimedValue)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(u.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
