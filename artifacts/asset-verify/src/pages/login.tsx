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

const forgotRequestSchema = z.object({
  email: z.string().email("Invalid email address"),
});

const forgotConfirmSchema = z.object({
  token: z.string().min(1, "Reset code is required"),
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
});

export default function Login() {
  const { user, setUser } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const login = useLoginUser();
  const [showForgot, setShowForgot] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetStep, setResetStep] = useState<"request" | "confirm">("request");
  const [resetEmail, setResetEmail] = useState("");

  useEffect(() => {
    if (user) setLocation("/dashboard");
  }, [user, setLocation]);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const requestForm = useForm<z.infer<typeof forgotRequestSchema>>({
    resolver: zodResolver(forgotRequestSchema),
    defaultValues: { email: "" },
  });

  const confirmForm = useForm<z.infer<typeof forgotConfirmSchema>>({
    resolver: zodResolver(forgotConfirmSchema),
    defaultValues: { token: "", newPassword: "" },
  });

  const resetForgotFlow = () => {
    setResetStep("request");
    setResetEmail("");
    requestForm.reset();
    confirmForm.reset();
  };

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

  // Requests a reset code for `email`. Each call issues a FRESH code by email;
  // older unused codes stay valid until they expire (30 min). Used for both the
  // first request and the "Resend code" button on the confirm step.
  const sendResetCode = async (email: string, isResend: boolean) => {
    if (!email) return;
    setIsResetting(true);
    try {
      const response = await fetch("/api/users/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Request failed");
      toast({
        title: isResend ? "New code sent" : "Reset code sent",
        description:
          "If an account matches, a reset code has been sent to its email (check your Spam folder too). Enter the latest code below to set a new password.",
      });
      setResetEmail(email);
      // The code is delivered only to the account owner's email — never prefilled,
      // so only someone with access to that inbox can complete the reset.
      if (isResend) {
        confirmForm.setValue("token", "");
      } else {
        confirmForm.reset({ token: "", newPassword: "" });
        setResetStep("confirm");
      }
    } catch (err: any) {
      toast({
        title: "Request Failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsResetting(false);
    }
  };

  const onRequestSubmit = (values: z.infer<typeof forgotRequestSchema>) =>
    sendResetCode(values.email, false);

  const onConfirmSubmit = async (
    values: z.infer<typeof forgotConfirmSchema>,
  ) => {
    setIsResetting(true);
    try {
      const response = await fetch("/api/users/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: values.token,
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
      resetForgotFlow();
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
          {resetStep === "request" ? (
            <Form {...requestForm}>
              <form
                onSubmit={requestForm.handleSubmit(onRequestSubmit)}
                className="space-y-4"
              >
                <p className="text-sm text-muted-foreground">
                  Enter your email and we'll issue a one-time reset code.
                </p>
                <FormField
                  control={requestForm.control}
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
                <Button type="submit" disabled={isResetting}>
                  Send Reset Code
                </Button>
              </form>
            </Form>
          ) : (
            <Form {...confirmForm}>
              <form
                onSubmit={confirmForm.handleSubmit(onConfirmSubmit)}
                className="space-y-4"
              >
                <p className="text-sm text-muted-foreground">
                  Enter the reset code and choose a new password. The code
                  expires in 30 minutes and can only be used once. Didn't get it?
                  Check your Spam folder or tap Resend code.
                </p>
                <FormField
                  control={confirmForm.control}
                  name="token"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reset Code</FormLabel>
                      <FormControl>
                        <Input type="text" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={confirmForm.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetForgotFlow}
                    disabled={isResetting}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => sendResetCode(resetEmail, true)}
                    disabled={isResetting || !resetEmail}
                  >
                    Resend code
                  </Button>
                  <Button type="submit" disabled={isResetting}>
                    Update Password
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
