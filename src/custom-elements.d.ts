declare namespace JSX {
  interface IntrinsicElements {
    'iconify-icon': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      icon?: string;
      class?: string;
      width?: string;
      height?: string;
      inline?: boolean;
    };
  }
}
