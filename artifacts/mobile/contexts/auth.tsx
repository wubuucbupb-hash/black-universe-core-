import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useLoginUser,
  useRegisterUser,
  type User,
  type UserLogin,
  type UserRegistration,
} from "@workspace/api-client-react";

export const TOKEN_KEY = "blackuniverse.token";
const USER_KEY = "blackuniverse.user";

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isBootstrapping: boolean;
  login: (input: UserLogin) => Promise<void>;
  register: (input: UserRegistration) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  const loginMutation = useLoginUser();
  const registerMutation = useRegisterUser();

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [storedToken, storedUser] = await Promise.all([
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(USER_KEY),
        ]);
        if (!active) return;
        if (storedToken) setToken(storedToken);
        if (storedUser) {
          try {
            setUser(JSON.parse(storedUser) as User);
          } catch {
            // ignore malformed cache
          }
        }
      } finally {
        if (active) setIsBootstrapping(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const persistSession = useCallback(
    async (nextToken: string | null, nextUser: User) => {
      setUser(nextUser);
      setToken(nextToken);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(nextUser));
      if (nextToken) {
        await AsyncStorage.setItem(TOKEN_KEY, nextToken);
      }
    },
    [],
  );

  const login = useCallback(
    async (input: UserLogin) => {
      const res = await loginMutation.mutateAsync({ data: input });
      await persistSession(res.token ?? null, res.user);
    },
    [loginMutation, persistSession],
  );

  const register = useCallback(
    async (input: UserRegistration) => {
      const res = await registerMutation.mutateAsync({ data: input });
      await persistSession(res.token ?? null, res.user);
    },
    [registerMutation, persistSession],
  );

  const logout = useCallback(async () => {
    setUser(null);
    setToken(null);
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!token,
      isBootstrapping,
      login,
      register,
      logout,
    }),
    [user, token, isBootstrapping, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
