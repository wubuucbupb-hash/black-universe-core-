import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/components/auth-provider";
import NotFound from "@/pages/not-found";

import Login from "@/pages/login";
import Register from "@/pages/register";
import Dashboard from "@/pages/dashboard";
import SubmitAsset from "@/pages/submit";
import Admin from "@/pages/admin";
import MatrixEngine from "@/pages/matrix";
import VaultPage from "@/pages/vault";

const queryClient = new QueryClient();

import { useAuth } from "@/components/auth-provider";

function Router() {
  const { user } = useAuth();

  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/register" component={Register} />
      <Route path="/matrix" component={MatrixEngine} />
      <Route path="/vault" component={VaultPage} />

      <Route path="/dashboard">
        {user ? <Dashboard /> : <Login />}
      </Route>

      <Route path="/submit">
        {user ? <SubmitAsset /> : <Login />}
      </Route>

      <Route path="/admin">
        <Admin />
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;

function Home() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4 text-center">
        <h1 className="text-3xl font-bold tracking-wider text-cyan-400 mb-6">
          🪐 BLACK UNIVERSE
        </h1>

        {/* Matrix Engine */}
        <div className="p-4 bg-zinc-900 border border-cyan-900 rounded-lg space-y-2">
          <p className="text-[10px] text-cyan-600 font-mono tracking-widest">🌌 SOVEREIGN MATRIX</p>
          <button
            onClick={() => setLocation("/matrix")}
            className="w-full py-3 bg-cyan-500 text-black font-extrabold rounded-md hover:bg-cyan-400 transition-all text-base shadow-lg shadow-cyan-500/25"
          >
            🔥 Matrix Engine
          </button>
          <p className="text-[10px] text-zinc-600 font-mono">Citizen Registration · Mint · P2P Transfer</p>
        </div>

        {/* Admin Section */}
        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg space-y-2">
          <p className="text-xs text-zinc-500 font-mono tracking-widest">1. SYSTEM ARCHITECT</p>
          <button
            onClick={() => setLocation("/admin")}
            className="w-full py-3 bg-transparent border-2 border-cyan-500 text-cyan-400 font-bold rounded-md hover:bg-cyan-950 transition-all text-base"
          >
            🛠️ Admin Control Room
          </button>
        </div>

        {/* Citizen Section */}
        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg space-y-2">
          <p className="text-xs text-zinc-500 font-mono tracking-widest">2. EXISTING CITIZEN</p>
          <button
            onClick={() => setLocation("/dashboard")}
            className="w-full py-3 bg-zinc-800 text-zinc-300 font-bold rounded-md hover:bg-zinc-700 transition-all text-base"
          >
            👤 Citizen Portal (Log In)
          </button>
        </div>

        {/* New Registration */}
        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg space-y-2">
          <p className="text-xs text-zinc-500 font-mono tracking-widest">3. SYSTEM ENTRY</p>
          <button
            onClick={() => setLocation("/register")}
            className="w-full py-3 bg-zinc-900 text-zinc-400 font-bold rounded-md hover:bg-zinc-800 transition-all text-base border border-zinc-700"
          >
            ✨ New Registration
          </button>
        </div>
      </div>
    </div>
  );
}
