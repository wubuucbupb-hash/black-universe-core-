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
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export default function Login() {
  const { user, setUser } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const login = useLoginUser();

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  if (user) {
    setLocation("/dashboard");
    return null;
  }

  const onSubmit = (values: z.infer<typeof loginSchema>) => {
    login.mutate({ data: values }, {
      onSuccess: (res) => {
        setUser(res.user);
        setLocation("/dashboard");
      },
      onError: (err: unknown) => {
        const msg = (err as { error?: string })?.error;
        toast({
          title: "Authentication Failed",
          description: msg || "Please check your credentials and try again.",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-24 flex flex-col items-center">
        <div className="w-full max-w-md bg-white border shadow-sm p-8 rounded-lg">
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
                      <Input type="email" placeholder="investor@example.com" {...field} data-testid="input-email" />
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
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} data-testid="input-password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full mt-4" disabled={login.isPending} data-testid="button-submit">
                {login.isPending ? "Authenticating..." : "Access Portfolio"}
              </Button>
            </form>
          </Form>

          <div className="mt-8 text-center text-sm border-t pt-6">
            <p className="text-muted-foreground">
              New client?{" "}
              <Link href="/register" className="text-primary font-medium hover:underline" data-testid="link-register">
                Establish an account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
