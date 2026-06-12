import { useAuth } from "@/components/auth-provider";
import { Layout } from "@/components/layout";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSubmitAsset, getListMyAssetsQueryKey, getGetMyAssetSummaryQueryKey } from "@workspace/api-client-react";
import { ObjectUploader } from "@workspace/object-storage-web";
import type { UploadResult } from "@uppy/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Info, FileText, X, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useState, useRef } from "react";

const submitSchema = z.object({
  assetType: z.enum(["real_estate", "vehicle", "gold_jewelry", "stocks", "business", "other"], {
    required_error: "Please select an asset type",
  }),
  claimedValue: z.coerce.number().min(1, "Value must be greater than 0"),
  description: z.string().min(5, "Please provide a detailed description"),
  documentNote: z.string().optional(),
});

type UploadedDoc = { name: string; objectPath: string };

export default function SubmitAsset() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const submit = useSubmitAsset();
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const objectPathsRef = useRef<Map<string, { name: string; objectPath: string }>>(new Map());

  const form = useForm<z.infer<typeof submitSchema>>({
    resolver: zodResolver(submitSchema),
    defaultValues: {
      assetType: "real_estate",
      claimedValue: 0,
      description: "",
      documentNote: "",
    },
  });

  if (isLoading) return null;
  if (!user) {
    setLocation("/");
    return null;
  }

  const handleUploadComplete = (result: UploadResult<Record<string, unknown>, Record<string, unknown>>) => {
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
    submit.mutate(
      {
        data: {
          ...values,
          documentUrls: uploadedDocs.map((d) => d.objectPath),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMyAssetsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetMyAssetSummaryQueryKey() });
          toast({
            title: "Asset Declared",
            description: "Your asset has been submitted for verification.",
          });
          setLocation("/dashboard");
        },
        onError: (err: unknown) => {
          const msg = (err as { error?: string })?.error;
          toast({
            title: "Submission Failed",
            description: msg || "An error occurred while submitting the asset.",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-serif font-bold text-primary">Declare New Asset</h1>
          <p className="text-muted-foreground mt-2">Submit asset details for official verification.</p>
        </div>

        <Alert className="mb-8 bg-blue-50 border-blue-200 text-blue-900">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-900 font-semibold">Verification Fee Notice</AlertTitle>
          <AlertDescription className="text-blue-800">
            A standard 1% verification fee applies to all approved assets. This fee covers legal, regulatory, and market analysis required to certify your portfolio.
          </AlertDescription>
        </Alert>

        <div className="bg-white border rounded-lg p-8 shadow-sm">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="assetType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Asset Classification</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-asset-type">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="real_estate">Real Estate</SelectItem>
                          <SelectItem value="vehicle">Vehicle (Luxury/Classic)</SelectItem>
                          <SelectItem value="gold_jewelry">Gold & Jewelry</SelectItem>
                          <SelectItem value="stocks">Equities & Bonds</SelectItem>
                          <SelectItem value="business">Business Equity</SelectItem>
                          <SelectItem value="other">Other High-Value Asset</SelectItem>
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
                      <FormLabel>Estimated Value (USD)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                          <Input type="number" className="pl-7 font-serif" placeholder="1000000" {...field} data-testid="input-value" />
                        </div>
                      </FormControl>
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
                      Optional. Provide a reference number here if you don't have a file to upload — or do both.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium leading-none mb-1">Proof Documents</p>
                  <p className="text-sm text-muted-foreground mb-3">
                    Upload images or PDFs of deeds, titles, certificates, or any supporting proof (optional).
                  </p>
                </div>

                <ObjectUploader
                  maxNumberOfFiles={5}
                  maxFileSize={10 * 1024 * 1024}
                  onGetUploadParameters={async (file) => {
                    const res = await fetch("/api/storage/uploads/request-url", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      credentials: "include",
                      body: JSON.stringify({
                        name: file.name,
                        size: file.size,
                        contentType: file.type,
                      }),
                    });
                    const { uploadURL, objectPath } = await res.json();
                    objectPathsRef.current.set(file.id, { name: file.name, objectPath });
                    return {
                      method: "PUT" as const,
                      url: uploadURL,
                      headers: { "Content-Type": file.type },
                    };
                  }}
                  onComplete={handleUploadComplete}
                  buttonClassName="flex items-center gap-2 px-4 py-2 rounded-md border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 text-sm font-medium text-slate-700 transition-colors w-full justify-center"
                >
                  <FileText className="h-4 w-4" /> Upload Proof Documents (images / PDF, max 10 MB each)
                </ObjectUploader>

                {uploadedDocs.length > 0 && (
                  <div className="space-y-2 mt-3">
                    <p className="text-sm font-medium text-green-700 flex items-center gap-1">
                      <CheckCircle2 className="h-4 w-4" /> {uploadedDocs.length} document(s) attached
                    </p>
                    {uploadedDocs.map((doc) => (
                      <div key={doc.objectPath} className="flex items-center justify-between bg-slate-50 border rounded px-3 py-2 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground truncate">
                          <FileText className="h-4 w-4 flex-shrink-0" />
                          <span className="truncate">{doc.name}</span>
                        </div>
                        <button type="button" onClick={() => removeDoc(doc.objectPath)} className="ml-2 text-muted-foreground hover:text-destructive flex-shrink-0">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-4 pt-4 border-t">
                <Button variant="outline" type="button" onClick={() => setLocation("/dashboard")} data-testid="button-cancel">
                  Cancel
                </Button>
                <Button type="submit" disabled={submit.isPending} className="gap-2" data-testid="button-submit-asset">
                  <ShieldCheck className="h-4 w-4" />
                  {submit.isPending ? "Submitting..." : "Submit for Verification"}
                </Button>
              </div>

            </form>
          </Form>
        </div>
      </div>
    </Layout>
  );
}
