export function Logo({ className = "" }: { className?: string }) {
  // OfferGo mark: a forward-pointing "O" — circle with an embedded arrow.
  // Reads as "O + Go". Monochrome, works at 16px–200px.
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="OfferGo logo"
      className={className}
    >
      <circle cx="12" cy="12" r="8.4" />
      <path d="M8.5 12h7" />
      <path d="M12.8 9.2 15.5 12l-2.7 2.8" />
    </svg>
  );
}
