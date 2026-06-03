export function DragonMark({ className = "h-14 w-14" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 128 128" role="img" aria-label="Dragon mark">
      <defs>
        <linearGradient id="dragon-mark-gradient" x1="12" y1="10" x2="112" y2="120">
          <stop stopColor="#facc15" />
          <stop offset="0.48" stopColor="#f97316" />
          <stop offset="1" stopColor="#2dd4bf" />
        </linearGradient>
      </defs>
      <path
        fill="url(#dragon-mark-gradient)"
        d="M20 76C11 44 24 22 52 39c7-21 30-21 38 0 28-17 41 5 32 37-8 31-31 46-51 46S28 107 20 76Z"
      />
      <path
        fill="#0f172a"
        d="M42 70c5-14 39-14 45 0 5 13-4 29-23 29S37 83 42 70Z"
      />
      <path stroke="#fff7ed" strokeLinecap="round" strokeWidth="6" d="M52 67c4-6 11-6 15 0M75 67c4-6 11-6 15 0" />
      <path fill="#ef4444" d="M64 78c-5 12 11 12 7 0h-7Z" />
    </svg>
  );
}
