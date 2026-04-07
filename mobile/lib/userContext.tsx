import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './supabase';
import type { User } from './types';

interface UserContextType {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const UserContext = createContext<UserContextType>({
  user: null,
  loading: true,
  refresh: async () => {},
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('frenz_users')
        .select('*')
        .eq('id', authUser.id)
        .single();

      if (data && !error) {
        setUser({
          id: data.id,
          email: data.email,
          full_name: data.full_name || authUser.user_metadata?.full_name || 'User',
          phone: data.phone || authUser.user_metadata?.phone || '',
          avatar_url: data.avatar_url,
          kyc_status: data.kyc_status || 'not_started',
          referral_code: data.referral_code || '',
          created_at: data.created_at,
        });
      } else {
        // Fallback to auth metadata
        setUser({
          id: authUser.id,
          email: authUser.email || '',
          full_name: authUser.user_metadata?.full_name || 'User',
          phone: authUser.user_metadata?.phone || '',
          avatar_url: undefined,
          kyc_status: 'not_started',
          referral_code: '',
          created_at: authUser.created_at,
        });
      }
    } catch (err) {
      console.log('Error fetching user:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchUser();
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <UserContext.Provider value={{ user, loading, refresh: fetchUser }}>
      {children}
    </UserContext.Provider>
  );
}

export const useUser = () => useContext(UserContext);
