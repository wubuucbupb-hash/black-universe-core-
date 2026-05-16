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
  role: z.string().default("citizen"),
  subCategory: z.string().optional(),
  documentUrl: z.string().optional(),
});

export default function Register() {
  const { user, setUser } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const register = useRegisterUser();

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      role: "citizen",
      subCategory: "",
      documentUrl: "",
    },
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
          description: "Welcome to Black Universe.",
        });
      },
      onError: (err: any) => {
        const msg = err?.error;
        toast({
          title: "Registration Failed",
          description: msg || "Please check your details and try again.",
          variant: "destructive",
        });
      },
    });
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-24 flex flex-col items-center justify-center">
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
                      <Input placeholder="John Doe" {...field} />
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
                      <Input type="email" placeholder="investor@example.com" {...field} />
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
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 🌐 Black Universe Dynamic Role Matrix Selector */}
              <div className="space-y-3 my-4 p-3 bg-slate-50 rounded-md border border-slate-200">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">एंट्री कैटेगरी चुनें</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'citizen', label: 'Citizen (9000)' },
                    { id: 'corporate', label: 'Corporate (5000/3000)' },
                    { id: 'sovereign', label: 'Sovereign (0000/1000)' },
                    { id: 'admin', label: 'Master Admin (0000)' }
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        form.setValue('role', item.id);
                        if(item.id !== 'sovereign' && item.id !== 'corporate') form.setValue('subCategory', '');
                      }}
                      className={`p-2 text-xs font-bold rounded border text-center transition-all ${
                        form.watch('role') === item.id
                          ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {/* Sovereign Options */}
                {form.watch('role') === 'sovereign' && (
                  <div className="pt-1">
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">Jurisdiction Selection</label>
                    <select
                      onChange={(e) => form.setValue('subCategory', e.target.value)}
                      className="w-full p-2 text-xs bg-white border border-slate-300 rounded outline-none text-slate-800"
                    >
                      <option value="0000">Government / Central Bank (0000)</option>
                      <option value="1000">Global Body - IMF/World Bank (1000)</option>
                      <option value="2000">Sovereign Asset Reserve (2000)</option>
                    </select>
                  </div>
                )}

                {/* Corporate Options */}
                {form.watch('role') === 'corporate' && (
                  <div className="pt-1">
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">Entity Selection</label>
                    <select
                      onChange={(e) => form.setValue('subCategory', e.target.value)}
                      className="w-full p-2 text-xs bg-white border border-slate-300 rounded outline-none text-slate-800"
                    >
                      <option value="5000">Commercial Company / Builder (5000)</option>
                      <option value="3000">Trust / NGO Institutional (3000)</option>
                    </select>
                  </div>
                )}

                {/* 📂 Verification Document Input */}
                {form.watch('role') !== 'admin' && (
                  <div className="pt-2 border-t border-slate-200">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">📂 Document Link (Required)</label>
                    <input
                      type="text"
                      placeholder="https://example.com/your-id.pdf"
                      onChange={(e) => form.setValue('documentUrl', e.target.value)}
                      className="w-full p-2 text-xs bg-white border border-slate-300 rounded outline-none text-slate-800 placeholder:text-slate-400"
                    />
                  </div>
                )}
              </div>

              <Button type="submit" className="w-full mt-4" disabled={register.isPending}>
                {register.isPending ? "Processing..." : "Create Account"}
              </Button>
            </form>
          </Form>

          <div className="mt-8 text-center text-sm border-t pt-6">
            <p className="text-muted-foreground">
              Already have an account?{" "}
              <Link href="/" className="text-primary font-medium hover:underline">
                Access Portfolio
              </Link>
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
