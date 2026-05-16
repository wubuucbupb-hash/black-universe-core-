import { useAuth } from "@/components/auth-provider";
import { Layout } from "@/components/layout";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLoginUser } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, KeyRound, Server } from "lucide-react";
import { useState } from "react";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export default function Login() {
  const { user, setUser } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const login = useLoginUser();
  const [showForgot, setShowForgot] = useState(false);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  if (user) {
    setLocation(user.role === "admin" ? "/admin" : "/dashboard");
    return null;
  }

  const onSubmit = (values: z.infer<typeof loginSchema>) => {
    login.mutate({ data: values }, {
      onSuccess: (res) => {
        setUser(res.user);
        setLocation(res.user.role === "admin" ? "/admin" : "/dashboard");
      },
      onError: (err: unknown) => {
        const msg = (err as { error?: string })?.error;
        toast({
          title: "Authentication Failed",
          description: msg || "Please check your credentials and try again.",
          variant: "destructive",
        });
      },
    });
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-24 flex flex-col items-center">
        <div className="w-full max-w-md bg-card border border-cyan-900/50 shadow-lg shadow-cyan-950/40 p-8 rounded-lg">
          <div className="flex flex-col items-center mb-8">
            <div className="h-12 w-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center mb-4">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-serif font-bold text-center">Client Portal Access</h1>
            <p className="text-sm text-muted-foreground mt-2 text-center">
              Securely manage and verify your global asset portfolio.
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="investor@example.com"
                        autoComplete="email"
                        {...field}
                        data-testid="input-email"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Password</FormLabel>
                      <button
                        type="button"
                        onClick={() => setShowForgot(true)}
                        className="text-xs text-cyan-500 hover:text-cyan-300 transition-colors"
                      >
                        Forgot Password?
                      </button>
                    </div>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="current-password"
                        {...field}
                        data-testid="input-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full mt-4"
                disabled={login.isPending}
                data-testid="button-submit"
              >
                {login.isPending ? "Authenticating..." : "Access Portfolio"}
              </Button>
            </form>
          </Form>

          <div className="mt-8 text-center text-sm border-t border-cyan-900/30 pt-6">
            <p className="text-muted-foreground">
              New client?{" "}
              <Link href="/register" className="text-primary font-medium hover:underline" data-testid="link-register">
                Establish an account
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      <Dialog open={showForgot} onOpenChange={setShowForgot}>
        <DialogContent className="bg-card border border-cyan-900/50 text-foreground max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-cyan-300 font-serif">
              <KeyRound className="h-5 w-5" />
              Reset Credentials
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-cyan-950/30 border border-cyan-900/40">
              <Server className="h-5 w-5 text-cyan-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-cyan-100 leading-relaxed">
                To reset Admin credentials, please update the system environment variables directly via host infrastructure.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Set <code className="text-cyan-400 bg-cyan-950/40 px-1 py-0.5 rounded">ADMIN_EMAIL</code> and <code className="text-cyan-400 bg-cyan-950/40 px-1 py-0.5 rounded">ADMIN_PASSWORD</code> in your deployment secrets panel. Changes take effect on the next server restart.
            </p>
            <Button
              className="w-full"
              onClick={() => setShowForgot(false)}
            >
              Understood
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
