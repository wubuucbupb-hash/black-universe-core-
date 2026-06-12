import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const CLUSTER_OPTIONS = [
  { value: "2", label: "Digit 2 Layer — Citizens" },
  { value: "3", label: "Digit 3 Layer — State" },
  { value: "4", label: "Digit 4 Layer — Nation" },
  { value: "5", label: "Digit 5 Layer — Strategic Partners" },
];

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    clusterPrefix: "2",
  });
  const [checks, setChecks] = useState({ follow: false, message: false });
  const [successAccount, setSuccessAccount] = useState<string | null>(null);

  const registerMutation = useMutation({
    mutationFn: async (body: object) => {
      const res = await fetch(`${BASE}/api/matrix/citizens`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");
      return data;
    },
    onSuccess: (data) => {
      setSuccessAccount(data.account.accountNumber);
      setForm({ name: "", phone: "", email: "", clusterPrefix: "2" });
      setChecks({ follow: false, message: false });
    },
    onError: (e: Error) =>
      toast({ title: "Registration Failed", description: e.message, variant: "destructive" }),
  });

  function handleSubmit() {
    if (!form.name.trim() || !form.phone.trim()) {
      toast({ title: "Missing Fields", description: "Name and phone number are required", variant: "destructive" });
      return;
    }
    if (!checks.follow || !checks.message) {
      toast({ title: "Gate Refused", description: "Please confirm both entry rules before proceeding", variant: "destructive" });
      return;
    }
    registerMutation.mutate({
      name: form.name,
      phone: form.phone,
      email: form.email,
      clusterPrefix: form.clusterPrefix,
    });
  }

  const clusterLabel = CLUSTER_OPTIONS.find((o) => o.value === form.clusterPrefix)?.label ?? "";

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
          <p className="text-zinc-500 text-xs font-mono mt-1 tracking-wider">SOVEREIGN CITIZEN REGISTRATION PORTAL</p>
        </div>

        {/* Success State */}
        {successAccount && (
          <div className="mb-6 border border-emerald-500 bg-emerald-500/10 rounded-xl p-5 text-center">
            <div className="text-emerald-400 text-2xl mb-2">✅</div>
            <div className="text-emerald-400 font-bold text-base">Identity Verified!</div>
            <div className="text-zinc-400 text-sm mt-1">Your Sovereign Wallet has been initialized</div>
            <div className="mt-3 bg-black/50 rounded-md px-4 py-3">
              <div className="text-zinc-500 text-[10px] font-mono tracking-widest mb-1">SYSTEM ACCOUNT NUMBER</div>
              <div className="text-cyan-400 text-xl font-bold font-mono tracking-widest">{successAccount}</div>
            </div>
            <div className="text-zinc-600 text-[11px] font-mono mt-2">ID stored as [Aadhaar Redacted] · {clusterLabel}</div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setSuccessAccount(null)}
                className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-bold rounded-md transition-all"
              >
                Register Another
              </button>
              <button
                onClick={() => setLocation("/")}
                className="flex-1 py-2 bg-cyan-500 hover:bg-cyan-400 text-black text-sm font-bold rounded-md transition-all"
              >
                Go to Home
              </button>
            </div>
          </div>
        )}

        {/* Registration Form */}
        {!successAccount && (
          <div className="border border-zinc-800 rounded-xl p-6 bg-zinc-950 space-y-4">
            <h2 className="text-xs font-bold font-mono text-cyan-400 tracking-widest mb-2">
              👤 STEP 1: LEGAL CITIZEN REGISTRATION PORTAL
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
              />
            </div>

            {/* National ID + Phone */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-zinc-400 text-xs font-mono">National ID (Mandatory) *</label>
                <input
                  type="password"
                  placeholder="Passport / Gov ID"
                  onChange={() => {}}
                  className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2.5 text-white text-sm focus:border-cyan-500 focus:outline-none placeholder-zinc-600"
                />
                <p className="text-zinc-600 text-[10px] mt-1 font-mono">Stored as [Aadhaar Redacted]</p>
              </div>
              <div>
                <label className="text-zinc-400 text-xs font-mono">Mobile (+Country Code) *</label>
                <input
                  type="text"
                  placeholder="+91 9876543210"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2.5 text-white text-sm focus:border-cyan-500 focus:outline-none placeholder-zinc-600"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="text-zinc-400 text-xs font-mono">Email Address (Optional)</label>
              <input
                type="email"
                placeholder="info@domain.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2.5 text-white text-sm focus:border-cyan-500 focus:outline-none placeholder-zinc-600"
              />
            </div>

            {/* Cluster */}
            <div>
              <label className="text-zinc-400 text-xs font-mono">Choose Network Cluster</label>
              <select
                value={form.clusterPrefix}
                onChange={(e) => setForm({ ...form, clusterPrefix: e.target.value })}
                className="w-full mt-1 bg-black border border-zinc-700 rounded-md px-3 py-2.5 text-white text-sm focus:border-cyan-500 focus:outline-none"
              >
                {CLUSTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Rules */}
            <div className="space-y-2 pt-1">
              <label className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={checks.follow}
                  onChange={(e) => setChecks({ ...checks, follow: e.target.checked })}
                  className="accent-cyan-400 w-4 h-4"
                />
                <span className="text-zinc-300 text-sm group-hover:text-white transition-colors">
                  Rule 1: Official Page Followed
                </span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={checks.message}
                  onChange={(e) => setChecks({ ...checks, message: e.target.checked })}
                  className="accent-cyan-400 w-4 h-4"
                />
                <span className="text-zinc-300 text-sm group-hover:text-white transition-colors">
                  Rule 2: Verification Message Sent
                </span>
              </label>
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={registerMutation.isPending}
              className="w-full py-3.5 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-extrabold rounded-md transition-all text-sm tracking-wide shadow-lg shadow-cyan-500/20 mt-2"
            >
              {registerMutation.isPending
                ? "⏳ PROCESSING..."
                : "🚀 VALIDATE AND INITIALIZE SOVEREIGN ID"}
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
