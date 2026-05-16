import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User } from "@workspace/api-client-react";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const STORAGE_KEY = "bu_auth_user";

function loadStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function saveUser(user: User | null) {
  try {
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // localStorage unavailable (private mode edge case) — silent
  }
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  // Optimistic initial state from localStorage — makes PWA feel instant
  const [optimisticUser, setOptimisticUser] = useState<User | null>(loadStoredUser);

  const { data: serverUser, isLoading, isError } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
      // Seed the cache with the stored user so the first render is non-null
      initialData: loadStoredUser() ?? undefined,
    },
  });

  // When the server confirms or denies the session, sync localStorage
  useEffect(() => {
    if (!isLoading) {
      if (isError || !serverUser) {
        // Session gone — clear storage so we don't show stale data
        saveUser(null);
        setOptimisticUser(null);
      } else {
        // Server confirmed — keep storage fresh
        saveUser(serverUser);
        setOptimisticUser(serverUser);
      }
    }
  }, [serverUser, isLoading, isError]);

  const setUser = (newUser: User | null) => {
    saveUser(newUser);
    setOptimisticUser(newUser);
    queryClient.setQueryData(getGetMeQueryKey(), newUser);
  };

  // Use optimisticUser so the dashboard appears instantly on PWA open
  const resolvedUser = isLoading ? optimisticUser : (isError ? null : (serverUser ?? null));

  return (
    <AuthContext.Provider value={{ user: resolvedUser, isLoading: isLoading && !optimisticUser, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
