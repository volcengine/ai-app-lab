import { createContext } from 'react';

export interface RouterContextType {
  current: string;
  query: Record<string, any>;
  navigate: (path: string, query?: Record<string, any>) => void;
}

export const RouterContext = createContext<RouterContextType>({} as unknown as never);
