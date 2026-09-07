// Convert IPv4 string to 32-bit unsigned integer
export function ip4ToLong(ip: string): number | null {
  if (!ip || typeof ip !== "string") return null;
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  let num = 0;
  for (const p of parts) {
    const n = parseInt(p, 10);
    if (isNaN(n) || n < 0 || n > 255 || p !== n.toString()) return null;
    num = (num << 8) + n;
  }
  return (num >>> 0);
}

// Convert IPv6 string to 128-bit BigInt
export function ip6ToBigInt(ip: string): bigint | null {
  if (!ip || typeof ip !== "string") return null;
  const clean = ip.trim().toLowerCase();
  if (!clean || !clean.includes(":")) return null;

  // Split on "::" compression (at most one occurrence allowed)
  const doubleColonParts = clean.split("::");
  if (doubleColonParts.length > 2) return null;

  let leftParts: string[] = [];
  let rightParts: string[] = [];

  if (doubleColonParts.length === 2) {
    leftParts = doubleColonParts[0] ? doubleColonParts[0].split(":") : [];
    rightParts = doubleColonParts[1] ? doubleColonParts[1].split(":") : [];
    const totalExplicit = leftParts.length + rightParts.length;
    if (totalExplicit >= 8) return null;
    const omittedCount = 8 - totalExplicit;
    const allParts = [...leftParts, ...Array(omittedCount).fill("0"), ...rightParts];
    return assembleIpv6Blocks(allParts);
  } else {
    const allParts = clean.split(":");
    if (allParts.length !== 8) return null;
    return assembleIpv6Blocks(allParts);
  }
}

function assembleIpv6Blocks(parts: string[]): bigint | null {
  if (parts.length !== 8) return null;
  let result = 0n;
  for (const part of parts) {
    if (!part || part.length > 4) return null;
    const val = parseInt(part, 16);
    if (isNaN(val) || val < 0 || val > 0xffff) return null;
    result = (result << 16n) | BigInt(val);
  }
  return result;
}

// Normalize any IPv6 address to its canonical /64 store subnet prefix
export function normalizeToIpv6Subnet64(ip: string): string | null {
  if (!ip || typeof ip !== "string") return null;
  const clean = ip.trim();
  if (clean.includes("/")) {
    // If already CIDR, check validity
    const [addr, maskStr] = clean.split("/");
    const mask = parseInt(maskStr, 10);
    const bigInt = ip6ToBigInt(addr);
    if (bigInt === null || isNaN(mask) || mask < 0 || mask > 128) return null;
    return clean;
  }

  const bigInt = ip6ToBigInt(clean);
  if (bigInt === null) return null;

  const b0 = ((bigInt >> 112n) & 0xffffn).toString(16);
  const b1 = ((bigInt >> 96n) & 0xffffn).toString(16);
  const b2 = ((bigInt >> 80n) & 0xffffn).toString(16);
  const b3 = ((bigInt >> 64n) & 0xffffn).toString(16);

  return `${b0}:${b1}:${b2}:${b3}::/64`;
}

// Check if client IP matches single IP or CIDR rule (IPv4 / IPv6)
export function isIpInAllowedList(clientIp: string, allowedIpsStr: string | null | undefined): boolean {
  if (!allowedIpsStr || !allowedIpsStr.trim()) return true; // NULL/empty = unrestricted
  if (!clientIp || clientIp === "unknown") return false;

  const cleanClient = clientIp.trim();
  const rules = allowedIpsStr.split(",").map(s => s.trim()).filter(Boolean);
  if (rules.length === 0) return true;

  const clientV4 = ip4ToLong(cleanClient);
  const clientV6 = clientV4 === null ? ip6ToBigInt(cleanClient) : null;

  for (const rule of rules) {
    if (rule.includes("/")) {
      const [netStr, maskStr] = rule.split("/");
      const maskBits = parseInt(maskStr, 10);
      if (isNaN(maskBits)) continue;

      if (clientV4 !== null) {
        // IPv4 CIDR matching
        const netV4 = ip4ToLong(netStr);
        if (netV4 !== null && maskBits >= 0 && maskBits <= 32) {
          const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;
          if ((clientV4 & mask) === (netV4 & mask)) {
            return true;
          }
        }
      } else if (clientV6 !== null && netStr.includes(":")) {
        // IPv6 CIDR matching (128-bit bitwise)
        if (maskBits >= 0 && maskBits <= 128) {
          const netV6 = ip6ToBigInt(netStr);
          if (netV6 !== null) {
            const mask = maskBits === 0 ? 0n : (((1n << 128n) - 1n) ^ ((1n << (128n - BigInt(maskBits))) - 1n));
            if ((clientV6 & mask) === (netV6 & mask)) {
              return true;
            }
          }
        }
      }
    } else {
      if (clientV4 !== null) {
        if (rule === cleanClient || ip4ToLong(rule) === clientV4) {
          return true;
        }
      } else if (clientV6 !== null && rule.includes(":")) {
        const ruleV6 = ip6ToBigInt(rule);
        if (ruleV6 !== null && ruleV6 === clientV6) {
          return true;
        }
      }
    }
  }

  return false;
}

// Validate format of allowed_ips string
export function isValidAllowedIpsFormat(allowedIps: string): boolean {
  if (!allowedIps || !allowedIps.trim()) return true;
  const items = allowedIps.split(",").map(s => s.trim()).filter(Boolean);
  if (items.length === 0) return true;

  for (const item of items) {
    if (item.includes("/")) {
      const [ip, mask] = item.split("/");
      const m = parseInt(mask, 10);
      if (isNaN(m)) return false;
      if (ip.includes(":")) {
        if (m < 0 || m > 128 || ip6ToBigInt(ip) === null) return false;
      } else {
        if (m < 0 || m > 32 || ip4ToLong(ip) === null) return false;
      }
    } else {
      if (item.includes(":")) {
        if (ip6ToBigInt(item) === null) return false;
      } else {
        if (ip4ToLong(item) === null) return false;
      }
    }
  }

  return true;
}

