import { Link, useLocation } from "wouter";
import { useAuth } from "./auth-provider";
import { useLogoutUser } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { ShieldCheck, LogOut, LayoutDashboard, FilePlus, ShieldAlert } from "lucide-react";

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

          {user && (
            <nav className="flex items-center gap-4">
              <Link href="/dashboard">
                <Button variant="ghost" className="gap-2 text-cyan-300 hover:text-cyan-100 hover:bg-cyan-950/50" data-testid="link-dashboard">
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </Button>
              </Link>
              <Link href="/submit">
                <Button variant="ghost" className="gap-2 text-cyan-300 hover:text-cyan-100 hover:bg-cyan-950/50" data-testid="link-submit">
                  <FilePlus className="h-4 w-4" />
                  Declare Asset
                </Button>
              </Link>
              {user.role === "admin" && (
                <Link href="/admin">
                  <Button variant="ghost" className="gap-2 text-cyan-300 hover:text-cyan-100 hover:bg-cyan-950/50" data-testid="link-admin">
                    <ShieldAlert className="h-4 w-4" />
                    Admin
                  </Button>
                </Link>
              )}
              <div className="h-6 w-px bg-cyan-900 mx-2" />
              <div className="flex flex-col text-right mr-2 hidden md:block">
                <span className="text-sm font-medium leading-none text-cyan-100">{user.name}</span>
                <span className="text-xs text-cyan-500">{user.email}</span>
              </div>
              <Button variant="outline" size="sm" onClick={handleLogout} disabled={logout.isPending} className="border-cyan-800 text-cyan-300 hover:bg-cyan-950 hover:text-cyan-100" data-testid="button-logout">
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </nav>
          )}
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
