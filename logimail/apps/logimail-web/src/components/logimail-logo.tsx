type LogiMailLogoProps = Readonly<{
  label?: string;
  className?: string;
  showText?: boolean;
  subtitle?: string;
}>;

export function LogiMailLogo({
  label = 'LogiMail',
  className = '',
  showText = true,
  subtitle,
}: LogiMailLogoProps) {
  return (
    <span className={`logimail-logo ${className}`.trim()} aria-label={label}>
      <svg className="logimail-logo-mark" viewBox="0 0 128 128" role="img" aria-hidden="true" focusable="false">
        <rect x="8" y="8" width="112" height="112" rx="24" fill="var(--color-primary)" />
        <path
          d="M64 27 94 38v22c0 24-12.7 39.2-30 47.6C46.7 99.2 34 84 34 60V38l30-11Z"
          fill="var(--color-bg)"
        />
        <rect x="42" y="50" width="44" height="32" rx="5" fill="var(--color-primary)" />
        <path
          d="M44 54 64 68l20-14"
          fill="none"
          stroke="var(--color-bg)"
          strokeWidth="5.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="92" cy="38" r="15" fill="var(--color-accent)" />
        <path
          d="m85.5 38.3 4.7 4.7 8.7-10"
          fill="none"
          stroke="var(--color-bg)"
          strokeWidth="4.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {showText ? (
        <span className="logimail-logo-text-wrap">
          <span className="logimail-logo-wordmark" aria-hidden="true">
            <span>Logi</span>
            <span>Mail</span>
          </span>
          {subtitle ? <span className="logimail-logo-subtitle">{subtitle}</span> : null}
        </span>
      ) : null}
    </span>
  );
}
