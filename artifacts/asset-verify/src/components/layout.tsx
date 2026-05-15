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
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href={user ? "/dashboard" : "/"} className="flex items-center gap-2 text-primary hover:opacity-80 transition-opacity">
            <ShieldCheck className="h-6 w-6 text-accent" />
            <span className="font-serif text-xl font-bold tracking-tight">AssetVerify</span>
          </Link>

          {user && (
            <nav className="flex items-center gap-4">
              <Link href="/dashboard">
                <Button variant="ghost" className="gap-2" data-testid="link-dashboard">
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </Button>
              </Link>
              <Link href="/submit">
                <Button variant="ghost" className="gap-2" data-testid="link-submit">
                  <FilePlus className="h-4 w-4" />
                  Declare Asset
                </Button>
              </Link>
              {user.role === "admin" && (
                <Link href="/admin">
                  <Button variant="ghost" className="gap-2" data-testid="link-admin">
                    <ShieldAlert className="h-4 w-4" />
                    Admin
                  </Button>
                </Link>
              )}
              <div className="h-6 w-px bg-border mx-2" />
              <div className="flex flex-col text-right mr-2 hidden md:block">
                <span className="text-sm font-medium leading-none">{user.name}</span>
                <span className="text-xs text-muted-foreground">{user.email}</span>
              </div>
              <Button variant="outline" size="sm" onClick={handleLogout} disabled={logout.isPending} data-testid="button-logout">
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
      <footer className="border-t bg-white py-8 mt-12">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} AssetVerify Financial Services. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
