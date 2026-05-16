import { Switch, Route, Router as WouterRouter } from "wouter";
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

const queryClient = new QueryClient();

import { useAuth } from "@/components/auth-provider";

function Router() {
  const { user } = useAuth();

  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/register" component={Register} />
      
      <Route path="/dashboard">
        {user ? <Dashboard /> : <Login />}
      </Route>
      
      <Route path="/submit">
        {user ? <SubmitAsset /> : <Login />}
      </Route>
      
      <Route path="/admin">
        {user && user.email === "wubuucbupb@gmail.com" ? (
          <Admin />
        ) : (
          <div className="min-h-screen bg-black text-red-500 flex items-center justify-center font-bold">
            Access Denied. Redirecting...
            {setTimeout(() => { window.location.href = "/dashboard"; }, 2000) && null}
          </div>
        )}
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
