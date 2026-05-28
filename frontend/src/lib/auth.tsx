import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearAuthToken, setAuthToken } from './api';
import type { Profile, Role, User } from './types';

type AuthContextValue = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string, role: Role) => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    api.me()
      .then(({ user, profile }) => {
        if (!mounted) return;
        setUser(user);
        setProfile(profile);
      })
      .catch(() => {
        clearAuthToken();
        if (!mounted) return;
        setUser(null);
        setProfile(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    profile,
    loading,

    async signIn(email: string, password: string) {
      const result = await api.signIn(email, password);
      setAuthToken(result.token);
      setUser(result.user);
      setProfile(result.profile);
    },

    async signUp(email: string, password: string, fullName: string, role: Role) {
      const result = await api.signUp(email, password, fullName, role);
      setAuthToken(result.token);
      setUser(result.user);
      setProfile(result.profile);
    },

    signOut() {
      clearAuthToken();
      setUser(null);
      setProfile(null);
    },
  }), [user, profile, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
