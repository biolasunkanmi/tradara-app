import { createContext } from 'react';

export type AppUser = {
  id?: string;
  name?: string;
  email?: string;
  role?: 'BUYER' | 'SELLER' | 'ADMIN';
};

export type ActiveItem = {
  title?: string;
  price?: string;
  category?: string;
};

export interface AppContextValue {
  token: string | null;
  user: AppUser | null;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  isDarkMode: boolean;
  setActiveItem: (value: ActiveItem | null) => void;
  setIsAiOpen: (value: boolean) => void;
}

export const AppContext = createContext<AppContextValue | null>(null);
