/**
 * Converts a company name to a URL-safe tenant code (slug).
 * e.g. "Tata Motors Ltd." → "tata-motors-ltd"
 * Max 30 characters. Uniqueness must be enforced by DB constraint;
 * callers should append "-2", "-3" etc. on collision.
 */
export function toTenantCode(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
}
