/** The same lens symbol is used in the workspace and browser icons. */
export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="64" height="64" rx="18" fill="#4338CA" />
      <circle cx="29" cy="29" r="16" stroke="white" strokeWidth="5" />
      <path
        d="M41 41L51 51"
        stroke="white"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M23 35V23H29C33 23 35 25 35 28C35 31 33 33 29 33H23M29 33L35 38"
        stroke="#C7D2FE"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
