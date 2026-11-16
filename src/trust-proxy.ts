/**
 * Express "trust proxy" from TRUST_PROXY. Disabled by default (req.ip is the socket address).
 * - "false" or empty: disabled.
 * - "true": trusts every proxy (X-Forwarded-For is fully client-controlled unless a proxy always overwrites it).
 * - a non-negative integer: number of proxy hops to trust (e.g. 1 behind a single reverse proxy).
 * - comma-separated IPs, subnets or Express names (loopback, linklocal, uniquelocal): only those proxies.
 */
export function parseTrustProxy(raw: string | undefined): boolean | number | string[] {
  const value = (raw ?? "").trim();
  if (!value || value.toLowerCase() === "false") return false;
  if (value.toLowerCase() === "true") return true;
  if (/^\d+$/.test(value)) return Number(value);
  const entries = value.split(",").map(entry => entry.trim()).filter(Boolean);
  return entries.length ? entries : false;
}
