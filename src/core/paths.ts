/**
 * Cross-platform path and asset resolver.
 * Ensures all public assets use import.meta.env.BASE_URL without hard-coded absolute paths.
 */

export function getAssetUrl(relativePath: string): string {
  const base = import.meta.env.BASE_URL ?? '/';
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  const cleanRelative = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
  return `${cleanBase}${cleanRelative}`;
}
