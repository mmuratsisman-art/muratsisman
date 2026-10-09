import { enforceBuildSourceMatch } from '@/lib/content/build-guard';

/**
 * `process.env.BUILT_CONTENT_SOURCE` build'de next.config.mjs `env` ile gömülür (değişmez sabit). `next dev`'de kontrol atlanır (NODE_ENV≠production).
 */
export function runBuildSourceGuard(): void {
  enforceBuildSourceMatch({
    built: process.env.BUILT_CONTENT_SOURCE,
    runtime: process.env.CONTENT_SOURCE,
    nodeEnv: process.env.NODE_ENV,
    log: (line) => console.error(line),
    exit: (code) => process.exit(code),
  });
}
