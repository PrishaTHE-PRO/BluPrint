import tiredMascot from '../../assets/mascots/tired.png';

interface Props {
  /** Mascot width in px. */
  size?: number;
  /** Caption under the mascot. Omit for the mascot alone. */
  label?: string;
  className?: string;
}

/** The tired mascot, wobbling, with an optional caption. Used while things load. */
export default function MascotLoader({ size = 120, label, className = '' }: Props) {
  return (
    <div className={`mascot-loader ${className}`.trim()}>
      <img
        className="mascot-loader__img mascot-wobble mascot-tired"
        src={tiredMascot}
        alt=""
        aria-hidden="true"
        width={size}
        style={{ width: size }}
      />
      {label && <p className="mascot-loader__label">{label}</p>}
    </div>
  );
}
