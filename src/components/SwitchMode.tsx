import { useEffect, useId, useState, type CSSProperties, type FC } from 'react';
import { motion } from 'motion/react';
import { IoMoon, IoMoonOutline, IoSunny, IoSunnyOutline } from 'react-icons/io5';

interface SwitchModeProps {
  width?: number;
  height?: number;
  darkColor?: string;
  lightColor?: string;
  knobDarkColor?: string;
  knobLightColor?: string;
  borderDarkColor?: string;
  borderLightColor?: string;
  className?: string;
}

function readIsDark(): boolean {
  try {
    if (typeof window !== 'undefined' && window.blueprintTheme?.currentIsDark) {
      return window.blueprintTheme.currentIsDark();
    }
    const stored = localStorage.getItem('blueprintTheme');
    if (stored === 'dark') return true;
    if (stored === 'light') return false;
  } catch {
    /* ignore */
  }
  return document.documentElement.classList.contains('dark-mode');
}

function writeTheme(isDark: boolean) {
  if (typeof window !== 'undefined' && window.blueprintTheme?.applyTheme) {
    window.blueprintTheme.applyTheme(isDark);
    return;
  }
  document.documentElement.classList.toggle('dark-mode', isDark);
  document.body.classList.toggle('dark-mode', isDark);
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  try {
    localStorage.setItem('blueprintTheme', isDark ? 'dark' : 'light');
  } catch {
    /* ignore */
  }
}

/** Animated sun/moon theme switch — uses BluPrint's `blueprintTheme` / dark-mode class. */
export const SwitchMode: FC<SwitchModeProps> = ({
  width = 56,
  height = 28,
  darkColor = '#0B0B0B',
  lightColor = '#FFFFFF',
  knobDarkColor = '#2A2A2E',
  knobLightColor = '#F3F2F7',
  borderDarkColor = '#4C4C50',
  borderLightColor = '#D8D6E0',
  className = '',
}) => {
  const knobLayoutId = `switch-knob-${useId().replace(/:/g, '')}`;
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setIsDark(readIsDark());
      setMounted(true);
    });

    const sync = () => setIsDark(readIsDark());
    window.addEventListener('storage', sync);
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('storage', sync);
      observer.disconnect();
    };
  }, []);

  const shellStyle: CSSProperties = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    width,
    height,
    borderRadius: 999,
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: 'transparent',
    flexShrink: 0,
    padding: 0,
    cursor: 'pointer',
    background: 'transparent',
  };

  if (!mounted) {
    return (
      <div
        className={`theme-switch-btn ${className}`.trim()}
        style={{
          ...shellStyle,
          ['--theme-switch-w' as string]: `${width}px`,
          ['--theme-switch-h' as string]: `${height}px`,
        }}
      />
    );
  }

  const iconSize = height * 0.45;
  const cellStyle: CSSProperties = {
    position: 'relative',
    zIndex: 30,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: height,
    height,
  };

  return (
    <motion.button
      type="button"
      className={`theme-switch-btn ${className}`.trim()}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
      onClick={() => {
        const next = !isDark;
        writeTheme(next);
        setIsDark(next);
      }}
      style={{
        ...shellStyle,
        borderColor: isDark ? borderDarkColor : borderLightColor,
        ['--theme-switch-w' as string]: `${width}px`,
        ['--theme-switch-h' as string]: `${height}px`,
      }}
    >
      <motion.div
        style={{ position: 'absolute', inset: 0, borderRadius: 999 }}
        animate={{ backgroundColor: isDark ? darkColor : lightColor }}
        transition={{ duration: 0.4 }}
      />

      <motion.div
        layout
        layoutId={knobLayoutId}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        style={{
          position: 'absolute',
          zIndex: 30,
          width: height,
          height,
          borderRadius: 999,
          borderWidth: 2,
          borderStyle: 'solid',
          right: isDark ? -2 : undefined,
          left: isDark ? undefined : -2,
          backgroundColor: isDark ? knobDarkColor : knobLightColor,
          borderColor: isDark ? borderDarkColor : borderLightColor,
        }}
      />

      <motion.div
        style={cellStyle}
        animate={{ rotate: isDark ? 45 : 0 }}
        transition={{ type: 'spring', stiffness: 20 }}
      >
        {isDark ? (
          <IoSunnyOutline
            color="#8A8A8F"
            fill="#8A8A8F"
            stroke="#8A8A8F"
            style={{ width: iconSize, height: iconSize }}
          />
        ) : (
          <IoSunny
            color="#686771"
            fill="#686771"
            style={{ width: iconSize, height: iconSize }}
          />
        )}
      </motion.div>

      <motion.div
        style={cellStyle}
        animate={{ rotate: isDark ? 0 : 15 }}
        transition={{ type: 'spring', stiffness: 20, damping: 14 }}
      >
        {isDark ? (
          <IoMoon
            color="#F4F4FB"
            fill="#F4F4FB"
            style={{ width: iconSize, height: iconSize }}
          />
        ) : (
          <IoMoonOutline
            color="#ABABB4"
            fill="#ABABB4"
            stroke="#ABABB4"
            style={{ width: iconSize, height: iconSize }}
          />
        )}
      </motion.div>
    </motion.button>
  );
};

export default SwitchMode;
