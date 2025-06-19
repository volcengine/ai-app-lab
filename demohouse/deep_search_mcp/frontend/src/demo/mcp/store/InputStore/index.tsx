import { create } from 'zustand';

export interface Input {
  keyword: string;
  isActive: boolean;
  setKeyword: (keyword: string) => void;
  setIsActive: (isActive: boolean) => void;
}

const initialState = {
  keyword: '',
  isActive: false,
};

export const useInput = create<Input>((set, get) => ({
  ...initialState,
  setKeyword: keyword => set({ keyword }),
  setIsActive: val => set({ isActive: val }),
}));
