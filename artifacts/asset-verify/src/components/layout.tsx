import { Link, useLocation } from "wouter";
import { useAuth } from "./auth-provider";
import { useLogoutUser } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { ShieldCheck, LogOut, LayoutDashboard, FilePlus, ShieldAlert, Database, Zap, Lock, Sparkles } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, setUser } = useAuth();
  const [, setLocation] = useLocation();
  const logout = useLogoutUser();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        setUser(null);
        setLocation("/");
      }
    });
  };

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <header className="border-b border-cyan-900/50 bg-black/90 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href={user ? "/dashboard" : "/"} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <ShieldCheck className="h-6 w-6 text-cyan-400" />
            <span className="font-serif text-xl font-bold tracking-tight text-cyan-400">Black Universe</span>
          </Link>

          <nav className="flex items-center gap-1">
            {/* Matrix Engine — always visible */}
            <Link href="/matrix">
              <Button variant="ghost" size="sm" className="gap-1.5 text-cyan-400 hover:text-cyan-100 hover:bg-cyan-950/50 font-mono text-xs">
                <Zap className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Matrix</span>
              </Button>
            </Link>

            {user ? (
              <>
                <Link href="/dashboard">
                  <Button variant="ghost" size="sm" className="gap-1.5 text-cyan-300 hover:text-cyan-100 hover:bg-cyan-950/50" data-testid="link-dashboard">
                    <LayoutDashboard className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Dashboard</span>
                  </Button>
                </Link>

                <Link href="/vault">
                  <Button variant="ghost" size="sm" className="gap-1.5 text-yellow-400 hover:text-yellow-200 hover:bg-yellow-950/30">
                    <Lock className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Vault</span>
                  </Button>
                </Link>

                <Link href="/submit">
                  <Button variant="ghost" size="sm" className="gap-1.5 text-cyan-300 hover:text-cyan-100 hover:bg-cyan-950/50" data-testid="link-submit">
                    <FilePlus className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Declare</span>
                  </Button>
                </Link>

                {user.role === "admin" && (
                  <>
                    <Link href="/universe-control-space">
                      <Button variant="ghost" size="sm" className="gap-1.5 text-cyan-300 hover:text-cyan-100 hover:bg-cyan-950/50" data-testid="link-universe">
                        <Sparkles className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Universe</span>
                      </Button>
                    </Link>
                    <Link href="/admin">
                      <Button variant="ghost" size="sm" className="gap-1.5 text-cyan-300 hover:text-cyan-100 hover:bg-cyan-950/50" data-testid="link-admin">
                        <ShieldAlert className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Admin</span>
                      </Button>
                    </Link>
                    <Link href="/admin#matrix">
                      <Button variant="ghost" size="sm" className="gap-1.5 text-emerald-400 hover:text-emerald-200 hover:bg-emerald-950/30" title="Database Viewer">
                        <Database className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">DB</span>
                      </Button>
                    </Link>
                  </>
                )}

                <div className="h-5 w-px bg-cyan-900 mx-1" />
                <div className="flex-col text-right mr-1 hidden md:flex">
                  <span className="text-xs font-medium leading-none text-cyan-100">{user.name}</span>
                  <span className="text-[10px] text-cyan-600">{user.role === "admin" ? "👑 Founder" : "Citizen"}</span>
                </div>
                <Button variant="outline" size="sm" onClick={handleLogout} disabled={logout.isPending} className="border-cyan-800 text-cyan-400 hover:bg-cyan-950 hover:text-cyan-100 text-xs" data-testid="button-logout">
                  <LogOut className="h-3.5 w-3.5 sm:mr-1.5" />
                  <span className="hidden sm:inline">Sign Out</span>
                </Button>
              </>
            ) : (
              <Link href="/dashboard">
                <Button size="sm" className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs">
                  Log In
                </Button>
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1">
        {children}
      </main>
      <footer className="border-t border-cyan-900/40 bg-black py-8 mt-12">
        <div className="container mx-auto px-4 text-center text-sm text-cyan-700">
          <p>&copy; {new Date().getFullYear()} Black Universe Financial Services. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
