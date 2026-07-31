import { create } from 'zustand';

import type { CardGame, Region } from '@/types/models';

export type LotteryListMode = 'all' | 'mine';
export type LotteryStatusTab = 'all' | 'accepting' | 'resultPending' | 'ended';

interface FilterState {
  searchQuery: string;
  mode: LotteryListMode;
  statusTab: LotteryStatusTab;
  game: CardGame | 'all';
  region: Region | 'all';
  shopName: string | 'all';
  setSearchQuery: (value: string) => void;
  setMode: (mode: LotteryListMode) => void;
  setStatusTab: (tab: LotteryStatusTab) => void;
  setGame: (game: CardGame | 'all') => void;
  setRegion: (region: Region | 'all') => void;
  setShopName: (shopName: string | 'all') => void;
  resetFilters: () => void;
}

export const useFilterStore = create<FilterState>((set) => ({
  searchQuery: '',
  mode: 'all',
  statusTab: 'all',
  game: 'all',
  region: 'all',
  shopName: 'all',
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setMode: (mode) => set({ mode }),
  setStatusTab: (statusTab) => set({ statusTab }),
  setGame: (game) => set({ game }),
  setRegion: (region) => set({ region }),
  setShopName: (shopName) => set({ shopName }),
  resetFilters: () => set({ game: 'all', region: 'all', shopName: 'all' }),
}));
