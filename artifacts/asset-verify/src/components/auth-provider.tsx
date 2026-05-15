import { createContext, useContext, useEffect, ReactNode } from "react";
import { User } from "@workspace/api-client-react";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data: user, isLoading, isError } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
    }
  });

  const setUser = (newUser: User | null) => {
    queryClient.setQueryData(getGetMeQueryKey(), newUser);
  };

  const contextValue = {
    user: isError ? null : (user ?? null),
    isLoading,
    setUser,
  };

  return (
    <AuthContext.Provider value={contextValue}>
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
