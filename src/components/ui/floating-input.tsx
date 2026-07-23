import { cn } from '@/lib/utils';
import { useState, type InputHTMLAttributes } from 'react';

interface FloatingInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function FloatingInput({ label, className, onFocus, onBlur, onChange, defaultValue, value, ...props }: FloatingInputProps) {
  const [focused, setFocused] = useState(false);
  const [hasValue, setHasValue] = useState(() => {
    const initial = value ?? defaultValue;
    return initial != null && String(initial) !== '';
  });
  const floating = focused || hasValue;

  return (
    <div className="relative">
      <input
        className={cn(
          'peer w-full px-4 py-3 border rounded-lg bg-transparent outline-none',
          'border-border focus:border-primary transition-colors',
          className,
        )}
        placeholder=" "
        {...(value !== undefined ? { value } : { defaultValue })}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          setHasValue(e.target.value !== '');
          onBlur?.(e);
        }}
        onChange={(e) => {
          setHasValue(e.target.value !== '');
          onChange?.(e);
        }}
        {...props}
      />
      <label
        data-floating={floating ? 'true' : undefined}
        className={cn(
          'absolute left-4 top-3 text-muted-foreground transition-all duration-200 pointer-events-none',
          'peer-focus:-top-2.5 peer-focus:left-3 peer-focus:text-xs peer-focus:bg-background peer-focus:px-1',
          'peer-focus:text-primary',
          floating && '-top-2.5 left-3 text-xs bg-background px-1 text-primary',
        )}
      >
        {label}
      </label>
    </div>
  );
}
