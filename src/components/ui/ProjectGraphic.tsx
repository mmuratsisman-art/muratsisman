import type { ProjectGraphicKind } from '@/types';

const move = 'transition-transform duration-700 ease-out';

export default function ProjectGraphic({ kind }: { kind: ProjectGraphicKind }) {
  return (
    <svg viewBox="0 0 200 200" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
      {kind === 'rings' && (
        <g className={`${move} origin-center group-hover:rotate-[24deg] group-hover:scale-110`}>
          <circle cx="100" cy="100" r="86" strokeDasharray="3 8" />
          <circle cx="100" cy="100" r="58" />
          <circle cx="100" cy="100" r="28" fill="currentColor" fillOpacity=".25" />
          <circle cx="186" cy="100" r="9" fill="currentColor" stroke="none" />
          <circle cx="42" cy="58" r="6" fill="currentColor" stroke="none" />
        </g>
      )}
      {kind === 'flow' && (
        <g className={`${move} group-hover:translate-x-3`}>
          <rect x="14" y="30" width="56" height="40" rx="8" />
          <rect x="130" y="30" width="56" height="40" rx="8" />
          <rect x="72" y="130" width="56" height="40" rx="8" fill="currentColor" fillOpacity=".25" />
          <path d="M70 50h60M42 70v30h58v30M158 70v30h-58" strokeDasharray="4 6" />
        </g>
      )}
      {kind === 'nodes' && (
        <g className={`${move} origin-center group-hover:-rotate-12 group-hover:scale-105`}>
          <path d="M100 100 40 50M100 100l70-30M100 100l-50 70M100 100l60 60" />
          <circle cx="100" cy="100" r="20" fill="currentColor" fillOpacity=".25" />
          <circle cx="40" cy="50" r="10" fill="currentColor" stroke="none" />
          <circle cx="170" cy="70" r="8" fill="currentColor" stroke="none" />
          <circle cx="50" cy="170" r="7" fill="currentColor" stroke="none" />
          <circle cx="160" cy="160" r="11" />
        </g>
      )}
      {kind === 'dots' && (
        <g className={`${move} group-hover:translate-y-1`} fill="currentColor" stroke="none">
          {Array.from({ length: 5 }).flatMap((_, r) =>
            Array.from({ length: 5 }).map((__, c) => (
              <circle key={`${r}-${c}`} cx={30 + c * 35} cy={30 + r * 35} r={r === 2 && c === 2 ? 8 : 3} fillOpacity={r === 2 && c === 2 ? 1 : 0.5} />
            )),
          )}
        </g>
      )}
    </svg>
  );
}
