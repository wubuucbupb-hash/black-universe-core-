import { useAuth } from "@/components/auth-provider";
import { Layout } from "@/components/layout";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLoginUser } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, KeyRound } from "lucide-react";
import { useState, useEffect } from "react";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
});

export default function Login() {
  const { user, setUser } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const login = useLoginUser();
  const [showForgot, setShowForgot] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    if (user) setLocation("/dashboard");
  }, [user, setLocation]);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const forgotForm = useForm<z.infer<typeof forgotPasswordSchema>>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "", newPassword: "" },
  });

  const onSubmit = (values: z.infer<typeof loginSchema>) => {
    login.mutate(
      { data: values },
      {
        onSuccess: (res) => {
          setUser(res.user);
          setLocation("/dashboard");
        },
        onError: (err: any) => {
          toast({
            title: "Authentication Failed",
            description: err?.error || "Check credentials",
            variant: "destructive",
          });
        },
      },
    );
  };

  const onForgotSubmit = async (
    values: z.infer<typeof forgotPasswordSchema>,
  ) => {
    setIsResetting(true);
    try {
      const response = await fetch("/api/users/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: values.email,
          password: values.newPassword,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Reset failed");
      toast({
        title: "Success",
        description: "Password updated successfully!",
      });
      setShowForgot(false);
      forgotForm.reset();
    } catch (err: any) {
      toast({
        title: "Reset Failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsResetting(false);
    }
  };

  if (user) return null;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-24 flex flex-col items-center">
        <div className="w-full max-w-md bg-card border border-cyan-900/50 shadow-lg p-8 rounded-lg">
          <h1 className="text-2xl font-bold text-center mb-8">
            Client Portal Access
          </h1>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
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
                    <div className="flex justify-between">
                      <FormLabel>Password</FormLabel>
                      <button
                        type="button"
                        onClick={() => setShowForgot(true)}
                        className="text-xs text-cyan-500"
                      >
                        Forgot?
                      </button>
                    </div>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full">
                Access Portfolio
              </Button>
            </form>
          </Form>
        </div>
      </div>

      <Dialog open={showForgot} onOpenChange={setShowForgot}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
          </DialogHeader>
          <Form {...forgotForm}>
            <form
              onSubmit={forgotForm.handleSubmit(onForgotSubmit)}
              className="space-y-4"
            >
              <FormField
                control={forgotForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={forgotForm.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={isResetting}>
                Update Password
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
