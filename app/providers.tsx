"use client";

import { createContext, useContext, type ReactNode } from "react";
import { authClient } from "../lib/auth-client";
type AuthUser = { id: string; name: string; email?: string; handle: string };
type AuthContextType = { user: AuthUser | null; loading: boolean; refreshUser: () => Promise<void>; logout: () => Promise<void> };
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = authClient.useSession();
  const user = session.data?.user ? { id: session.data.user.id, name: session.data.user.name, email: session.data.user.email, handle: session.data.user.name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) } : null;
  const refreshUser = async () => { await session.refetch(); };
  const logout = async () => { await authClient.signOut(); await session.refetch(); };

  return <AuthContext.Provider value={{ user, loading: session.isPending, refreshUser, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
