import { useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useRegisterUser, type User } from "@workspace/api-client-react";
import { useAuth } from "@/components/auth-provider";

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { setUser } = useAuth();

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirm: "",
  });
  const [created, setCreated] = useState<User | null>(null);

  const registerMutation = useRegisterUser({
    mutation: {
      onSuccess: (data) => {
        setUser(data.user);
        setCreated(data.user);
      },
      onError: (err: any) => {
        toast({
          title: "Registration Failed",
          description: err?.error || "Could not create account",
          variant: "destructive",
        });
      },
    },
  });

  function handleSubmit() {
    if (!form.name.trim() || form.name.trim().length < 2) {
      toast({ title: "Invalid Name", description: "Please enter your full name", variant: "destructive" });
      return;
    }
    if (!form.email.trim()) {
      toast({ title: "Missing Email", description: "Email is required to log in", variant: "destructive" });
      return;
    }
    if (form.password.length < 6) {
      toast({ title: "Weak Password", description: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    if (form.password !== form.confirm) {
      toast({ title: "Passwords Do Not Match", description: "Please re-enter your password", variant: "destructive" });
      return;
    }
    registerMutation.mutate({
      data: {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        phoneNumber: form.phone.trim() || null,
      },
    });
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-6">
          <button
            onClick={() => setLocation("/")}
            className="text-zinc-600 hover:text-cyan-400 text-xs font-mono mb-4 block transition-colors"
          >
            ← BACK TO HOME
          </button>
          <h1 className="text-2xl font-bold tracking-widest text-cyan-400 font-mono">🌌 BLACK UNIVERSE</h1>
          <p className="text-zinc-500 text-xs font-mono mt-1 tracking-wider">CREATE YOUR SOVEREIGN ACCOUNT</p>
        </div>

        {/* Success State */}
        {created && (
          <div className="border border-emerald-500 bg-emerald-500/10 rounded-xl p-5 text-center">
            <div className="text-emerald-400 text-2xl mb-2">✅</div>
            <div className="text-emerald-400 font-bold text-base">Account Created!</div>
            <div className="text-zinc-400 text-sm mt-1">Your Sovereign Wallet is ready</div>
            <div className="mt-3 bg-black/50 rounded-md px-4 py-3">
              <div className="text-zinc-500 text-[10px] font-mono tracking-widest mb-1">YOUR ACCOUNT NUMBER</div>
              <div className="text-cyan-400 text-xl font-bold font-mono tracking-widest" data-testid="text-account-number">
                {created.accountNumber ?? "—"}
              </div>
            </div>
            <div className="mt-3 bg-black/50 rounded-md px-4 py-3 text-left">
              <div className="text-zinc-500 text-[10px] font-mono tracking-widest mb-1">LOGIN CREDENTIALS</div>
              <div className="text-zinc-300 text-sm font-mono">{created.email}</div>
              <div className="text-zinc-600 text-[11px] font-mono mt-1">Use this email + the password you set to log in.</div>
            </div>
            <button
              onClick={() => setLocation("/dashboard")}
              className="w-full mt-4 py-3 bg-cyan-500 hover:bg-cyan-400 text-black text-sm font-bold rounded-md transition-all"
              data-testid="button-enter-dashboard"
            >
              Enter Dashboard →
            </button>
          </div>
        )}

        {/* Registration Form */}
        {!created && (
          <div className="border border-zinc-800 rounded-xl p-6 bg-zinc-950 space-y-4">
            <h2 className="text-xs font-bold font-mono text-cyan-400 tracking-widest mb-2">
              👤 SOVEREIGN CITIZEN REGISTRATION
            </h2>

            {/* Name */}
            <div>
              <label className="text-zinc-400 text-xs font-mono">Full Name / Enterprise Name *</label>
              <input
                type="text"
                placeholder="e.g., Alok Verma"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2.5 text-white text-sm focus:border-cyan-500 focus:outline-none placeholder-zinc-600"
                data-testid="input-name"
              />
            </div>

            {/* Email + Phone */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-zinc-400 text-xs font-mono">Email Address *</label>
                <input
                  type="email"
                  placeholder="info@domain.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2.5 text-white text-sm focus:border-cyan-500 focus:outline-none placeholder-zinc-600"
                  data-testid="input-email"
                />
              </div>
              <div>
                <label className="text-zinc-400 text-xs font-mono">Mobile (Optional)</label>
                <input
                  type="text"
                  placeholder="+91 9876543210"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2.5 text-white text-sm focus:border-cyan-500 focus:outline-none placeholder-zinc-600"
                  data-testid="input-phone"
                />
              </div>
            </div>

            {/* Password + Confirm */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-zinc-400 text-xs font-mono">Password *</label>
                <input
                  type="password"
                  placeholder="Min. 6 characters"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2.5 text-white text-sm focus:border-cyan-500 focus:outline-none placeholder-zinc-600"
                  data-testid="input-password"
                />
              </div>
              <div>
                <label className="text-zinc-400 text-xs font-mono">Confirm Password *</label>
                <input
                  type="password"
                  placeholder="Re-enter password"
                  value={form.confirm}
                  onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                  className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2.5 text-white text-sm focus:border-cyan-500 focus:outline-none placeholder-zinc-600"
                  data-testid="input-confirm"
                />
              </div>
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={registerMutation.isPending}
              className="w-full py-3.5 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-extrabold rounded-md transition-all text-sm tracking-wide shadow-lg shadow-cyan-500/20 mt-2"
              data-testid="button-register"
            >
              {registerMutation.isPending ? "⏳ CREATING ACCOUNT..." : "🚀 CREATE SOVEREIGN ACCOUNT"}
            </button>

            <p className="text-center text-zinc-600 text-[11px] font-mono pt-1">
              Already have an account?{" "}
              <button
                onClick={() => setLocation("/dashboard")}
                className="text-cyan-500 hover:text-cyan-400 underline transition-colors"
              >
                Login here
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
