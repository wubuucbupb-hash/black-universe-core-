import { useAuth } from "@/components/auth-provider";
import { Layout } from "@/components/layout";
import { useLocation } from "wouter";
import { useGetMyAssetSummary, getGetMyAssetSummaryQueryKey, useListMyAssets, getListMyAssetsQueryKey, useDeleteAsset } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

  const { data: summary, isLoading: isSummaryLoading } = useGetMyAssetSummary({
    query: {
      queryKey: getGetMyAssetSummaryQueryKey(),
      enabled: !!user,
    }
  });

  const { data: assets, isLoading: isAssetsLoading } = useListMyAssets({
    query: {
      queryKey: getListMyAssetsQueryKey(),
      enabled: !!user,
    }
  });

  const deleteAsset = useDeleteAsset();

  if (isAuthLoading) {
    return <Layout><div className="p-8"><Skeleton className="h-[400px] w-full" /></div></Layout>;
  }

  if (!user) {
    setLocation("/");
    return null;
  }

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to withdraw this asset declaration?")) {
      deleteAsset.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMyAssetsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetMyAssetSummaryQueryKey() });
          toast({ title: "Asset Withdrawn", description: "The asset declaration has been removed." });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to withdraw asset.", variant: "destructive" });
        }
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved": return <Badge className="bg-green-600 hover:bg-green-700">Verified</Badge>;
      case "rejected": return <Badge variant="destructive">Rejected</Badge>;
      default: return <Badge variant="secondary" className="bg-accent/20 text-accent-foreground border-accent/30">Under Review</Badge>;
    }
  };

  const formatAssetType = (type: string) => {
    return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-serif font-bold mb-8 text-primary">Portfolio Overview</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Declared Value</CardTitle>
            </CardHeader>
            <CardContent>
              {isSummaryLoading ? <Skeleton className="h-10 w-32" /> : (
                <div className="text-4xl font-serif font-semibold text-primary">{formatCurrency(summary?.totalClaimedValue || 0)}</div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Verified Value</CardTitle>
            </CardHeader>
            <CardContent>
              {isSummaryLoading ? <Skeleton className="h-10 w-32" /> : (
                <div className="text-4xl font-serif font-semibold text-green-600">{formatCurrency(summary?.totalApprovedValue || 0)}</div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Asset Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {isSummaryLoading ? <Skeleton className="h-10 w-32" /> : (
                <div className="flex gap-4 text-sm mt-2">
                  <div className="flex flex-col"><span className="text-muted-foreground">Pending</span><span className="font-semibold text-lg">{summary?.totalPending || 0}</span></div>
                  <div className="w-px bg-border" />
                  <div className="flex flex-col"><span className="text-muted-foreground">Verified</span><span className="font-semibold text-lg text-green-600">{summary?.totalApproved || 0}</span></div>
                  <div className="w-px bg-border" />
                  <div className="flex flex-col"><span className="text-muted-foreground">Rejected</span><span className="font-semibold text-lg text-destructive">{summary?.totalRejected || 0}</span></div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-serif font-bold text-primary">Declared Assets</h2>
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
                    <TableHead className="font-medium text-primary">Asset Type</TableHead>
                    <TableHead className="font-medium text-primary">Description</TableHead>
                    <TableHead className="font-medium text-primary">Declared Value</TableHead>
                    <TableHead className="font-medium text-primary">Status</TableHead>
                    <TableHead className="font-medium text-primary">Date</TableHead>
                    <TableHead className="text-right font-medium text-primary">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assets.map((asset) => (
                    <TableRow key={asset.id}>
                      <TableCell className="font-medium">{formatAssetType(asset.assetType)}</TableCell>
                      <TableCell>
                        <div className="max-w-[300px] truncate" title={asset.description}>{asset.description}</div>
                        {asset.rejectionReason && (
                          <div className="text-xs text-destructive mt-1 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {asset.rejectionReason}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-serif">{formatCurrency(asset.claimedValue)}</TableCell>
                      <TableCell>{getStatusBadge(asset.status)}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(asset.createdAt)}</TableCell>
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
