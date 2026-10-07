import { create } from 'zustand';
import type { Role } from './permissions';

interface AuthState {
  role: Role;
  setRole: (role: Role) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  role: 'analyst',
  setRole: (role) => set({ role }),
}));
