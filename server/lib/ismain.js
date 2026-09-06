import { pathToFileURL } from 'node:url';

/**
 * True when `metaUrl` belongs to the module node was launched with.
 * Avoids hand-rolled path comparison, which is fragile on Windows.
 */
export function isMain(metaUrl) {
  if (!process.argv[1]) return false;
  return metaUrl === pathToFileURL(process.argv[1]).href;
}
