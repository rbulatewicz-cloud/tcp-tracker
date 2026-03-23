import { createContext } from 'react';
import type { PlanCardContextType } from './PlanCardProvider';

export const PlanCardContext = createContext<PlanCardContextType | undefined>(undefined);
