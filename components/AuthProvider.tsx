"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase, DEMO } from "@/lib/supabase.ts";

interface AuthState {
  user: User | null;
  loading: boolean;
  demo: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState>({ user: null, loading: true, demo: DEMO, signOut: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!DEMO);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase?.auth.signOut();
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, demo: DEMO, signOut }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
