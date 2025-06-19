import { Event } from './event';

export interface Step {
  id: string;
  description: string;
  finish: boolean;
  events: Event[];
  stepNumber?: number;
}
