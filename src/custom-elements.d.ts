import type { HTMLAttributes } from 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'iconify-icon': HTMLAttributes<HTMLElement> & {
        icon?:    string;
        class?:   string;
        width?:   string;
        height?:  string;
        inline?:  boolean;
      };
    }
  }
}
