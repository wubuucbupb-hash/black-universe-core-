import { useAuth } from "@/components/auth-provider";
import { Layout } from "@/components/layout";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRegisterUser } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck } from "lucide-react";

const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export default function Register() {
  const { user, setUser } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const register = useRegisterUser();

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  if (user) {
    setLocation("/dashboard");
    return null;
  }

  const onSubmit = (values: z.infer<typeof registerSchema>) => {
    register.mutate({ data: values }, {
      onSuccess: (user) => {
        setUser(user);
        setLocation("/dashboard");
        toast({
          title: "Registration Successful",
          description: "Welcome to AssetVerify.",
        });
      },
      onError: (err: unknown) => {
        const msg = (err as { error?: string })?.error;
        toast({
          title: "Registration Failed",
          description: msg || "Please check your details and try again.",
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
            <h1 className="text-2xl font-serif font-bold text-center">Establish Account</h1>
            <p className="text-sm text-muted-foreground mt-2 text-center">
              Begin managing your verified asset portfolio.
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Legal Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} data-testid="input-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
              <Button type="submit" className="w-full mt-4" disabled={register.isPending} data-testid="button-submit">
                {register.isPending ? "Processing..." : "Create Account"}
              </Button>
            </form>
          </Form>

          <div className="mt-8 text-center text-sm border-t pt-6">
            <p className="text-muted-foreground">
              Already have an account?{" "}
              <Link href="/" className="text-primary font-medium hover:underline" data-testid="link-login">
                Access Portfolio
              </Link>
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
