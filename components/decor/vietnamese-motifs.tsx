import { cn } from "@/lib/utils";

function polarPoint(radius: number, angle: number) {
  const radian = (angle - 90) * (Math.PI / 180);
  return {
    x: 128 + radius * Math.cos(radian),
    y: 128 + radius * Math.sin(radian)
  };
}

export function DongSonDrum({ className }: { className?: string }) {
  const rays = Array.from({ length: 16 }, (_, index) => {
    const angle = index * 22.5;
    const tip = polarPoint(37, angle);
    const left = polarPoint(15, angle - 6.5);
    const right = polarPoint(15, angle + 6.5);

    return `${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`;
  });
  const triangles = Array.from({ length: 32 }, (_, index) => {
    const angle = index * 11.25;
    const tip = polarPoint(112, angle);
    const left = polarPoint(96, angle - 4.2);
    const right = polarPoint(96, angle + 4.2);

    return `${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`;
  });
  const birds = Array.from({ length: 8 }, (_, index) => `rotate(${index * 45} 128 128)`);

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 256 256"
      className={cn("pointer-events-none text-[var(--accent)]", className)}
      fill="none"
    >
      <circle cx="128" cy="128" r="122" stroke="currentColor" strokeWidth="2" opacity="0.35" />
      <circle cx="128" cy="128" r="104" stroke="currentColor" strokeWidth="1.5" opacity="0.28" />
      <circle cx="128" cy="128" r="82" stroke="currentColor" strokeWidth="1.5" opacity="0.32" />
      <circle cx="128" cy="128" r="50" stroke="currentColor" strokeWidth="2" opacity="0.42" />
      <circle cx="128" cy="128" r="12" fill="currentColor" opacity="0.48" />
      {rays.map((points) => (
        <polygon key={points} points={points} fill="currentColor" opacity="0.46" />
      ))}
      {triangles.map((points) => (
        <polygon key={points} points={points} fill="currentColor" opacity="0.22" />
      ))}
      {birds.map((transform) => (
        <g key={transform} transform={transform} opacity="0.48" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M128 39c10 14 25 20 46 17-16 9-34 11-50 2" />
          <path d="M125 58c-9 7-19 11-30 10 12-8 21-15 27-27" />
          <path d="M139 50c8-5 16-6 25-2" />
        </g>
      ))}
      <path d="M39 128h178M128 39v178" stroke="currentColor" strokeWidth="1" opacity="0.14" />
    </svg>
  );
}

export function LacBird({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 320 160"
      className={cn("pointer-events-none text-[var(--primary)]", className)}
      fill="none"
    >
      <path
        d="M34 97c48-8 77-28 116-58 8-6 18-8 27-3 14 8 16 24 5 34-9 8-22 9-36 3"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.72"
      />
      <path
        d="M102 87c34 8 73 7 113-3 28-7 50-20 70-40-6 28-27 55-61 73-33 17-72 19-118 5"
        fill="currentColor"
        opacity="0.14"
      />
      <path
        d="M105 87c35 26 76 33 123 21-38 30-87 33-145 3"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        opacity="0.58"
      />
      <path d="M158 77c-6 26-8 46-7 61M189 72c-1 24 3 45 14 63" stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity="0.62" />
      <path d="M143 139c17-4 29-4 42 0M197 137c16-5 28-5 43-1" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity="0.5" />
      <path d="M180 35c32-14 60-15 84-3-30 3-55 10-76 23" stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity="0.64" />
      <circle cx="170" cy="48" r="3" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

export function HeronMotif({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 260 220"
      className={cn("pointer-events-none text-[var(--primary)]", className)}
      fill="none"
    >
      <path
        d="M65 155c44-7 78-31 102-70 8-14 7-30-4-41-8-8-20-10-31-5 20 4 29 17 23 32-11 28-37 50-78 66"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.74"
      />
      <path
        d="M86 138c34 20 78 22 132 6-30 32-78 49-126 32-22-8-43-23-62-45 22 5 41 7 56 7Z"
        fill="currentColor"
        opacity="0.16"
      />
      <path
        d="M90 141c36 12 75 8 118-12M121 150c-13 21-18 39-14 56M146 151c3 23 12 41 28 54"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.58"
      />
      <path
        d="M97 205c16-6 30-6 43 1M166 205c18-7 32-7 46 0"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        opacity="0.48"
      />
      <path
        d="M157 43c27-20 56-27 88-20-32 11-57 25-75 43"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.66"
      />
      <circle cx="148" cy="55" r="3.5" fill="currentColor" opacity="0.72" />
      <path d="M30 169c26-5 49-4 71 4M34 184c25-4 47-3 68 4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.26" />
    </svg>
  );
}

export function DongSonWave({ className }: { className?: string }) {
  const cells = Array.from({ length: 12 }, (_, index) => index);

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 720 96"
      className={cn("pointer-events-none text-[var(--accent)]", className)}
      fill="none"
    >
      {cells.map((cell) => {
        const x = cell * 60;
        return (
          <g key={cell} transform={`translate(${x} 0)`} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 48 18 28l14 20 14-20 14 20" strokeWidth="3" opacity="0.32" />
            <path d="M10 66c12-15 28-15 40 0M10 76c12-10 28-10 40 0" strokeWidth="2" opacity="0.24" />
            <circle cx="32" cy="21" r="5" fill="currentColor" opacity="0.2" />
          </g>
        );
      })}
    </svg>
  );
}

export function VietnameseMotifLayer({
  className,
  dense = false
}: {
  className?: string;
  dense?: boolean;
}) {
  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <DongSonDrum className="absolute -right-24 -top-24 h-72 w-72 rotate-12 opacity-[0.32] md:h-96 md:w-96" />
      <DongSonDrum className="absolute -bottom-32 left-[-7rem] h-72 w-72 -rotate-12 opacity-[0.18] md:h-96 md:w-96" />
      <HeronMotif className="absolute right-8 top-28 hidden w-64 -rotate-3 opacity-[0.18] lg:block" />
      <LacBird className="absolute left-1/2 top-1/2 hidden w-72 -translate-x-1/2 -translate-y-1/2 opacity-[0.12] lg:block" />
      <DongSonWave className="absolute bottom-8 left-1/2 w-[42rem] -translate-x-1/2 opacity-[0.22]" />
      {dense && (
        <>
          <HeronMotif className="absolute left-12 top-20 hidden w-52 rotate-6 scale-x-[-1] opacity-[0.16] xl:block" />
          <DongSonWave className="absolute left-0 top-24 w-[38rem] opacity-[0.14]" />
        </>
      )}
    </div>
  );
}
