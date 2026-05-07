import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebase';
import { ensureUserProfile } from './ai';
import { UserProfile } from './db';

type AuthContextType = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<UserProfile | null>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  refreshProfile: async () => null,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setProfile(null);
      return null;
    }
    const nextProfile = await ensureUserProfile();
    setProfile(nextProfile);
    return nextProfile;
  }, []);

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setLoading(true);
      if (!u) {
        setUser(null);
        setProfile(null);
        if (active) setLoading(false);
        return;
      }

      try {
        const nextProfile = await ensureUserProfile();
        if (active) {
          setProfile(nextProfile);
          setUser(u);
        }
      } finally {
        if (active) setLoading(false);
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
