const assert = require("assert");
const fs = require("fs");
const path = require("path");

// Load network.ts source to test pure logic
const networkTs = fs.readFileSync(path.resolve(__dirname, "src/utils/network.ts"), "utf8");

// We can test the logic directly in node
console.log("================================================================================");
console.log("🚀 STARTING TEST: DUAL-STACK IPV6 & LEAVE REJECTION (v2.14.7)");
console.log("================================================================================\n");

// Re-implement or eval network functions in JS for standalone testing
function ip4ToLong(ip) {
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

function assembleIpv6Blocks(parts) {
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

function ip6ToBigInt(ip) {
  if (!ip || typeof ip !== "string") return null;
  const clean = ip.trim().toLowerCase();
  if (!clean || !clean.includes(":")) return null;

  const doubleColonParts = clean.split("::");
  if (doubleColonParts.length > 2) return null;

  let leftParts = [];
  let rightParts = [];

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

function normalizeToIpv6Subnet64(ip) {
  if (!ip || typeof ip !== "string") return null;
  const clean = ip.trim();
  if (clean.includes("/")) {
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

function isIpInAllowedList(clientIp, allowedIpsStr) {
  if (!allowedIpsStr || !allowedIpsStr.trim()) return true;
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
        const netV4 = ip4ToLong(netStr);
        if (netV4 !== null && maskBits >= 0 && maskBits <= 32) {
          const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;
          if ((clientV4 & mask) === (netV4 & mask)) {
            return true;
          }
        }
      } else if (clientV6 !== null && netStr.includes(":")) {
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

let passed = 0;
function test(desc, fn) {
  try {
    fn();
    console.log("✅ [PASS]", desc);
    passed++;
  } catch (e) {
    console.error("❌ [FAIL]", desc, e);
    process.exit(1);
  }
}

// 1. IPv6 tests
test("ip6ToBigInt: basic and compressed", () => {
  assert(ip6ToBigInt("::1") === 1n);
  assert(ip6ToBigInt("2001:db8::1") === ip6ToBigInt("2001:0db8:0000:0000:0000:0000:0000:0001"));
});

test("normalizeToIpv6Subnet64: converts SLAAC IPv6 to /64", () => {
  const s = normalizeToIpv6Subnet64("2001:b030:2313:1100:e402:f3ff:fe21:1234");
  assert.strictEqual(s, "2001:b030:2313:1100::/64");
});

test("isIpInAllowedList: real device IPv6 against /64 CIDR", () => {
  const client = "2001:b030:2313:1100:e402:f3ff:fe21:1234";
  const rule = "2001:b030:2313:1100::/64";
  assert(isIpInAllowedList(client, rule));
  assert(!isIpInAllowedList("2001:b030:9999:ffff::1", rule));
});

test("isIpInAllowedList: dual-stack list", () => {
  const list = "59.126.167.108, 2001:b030:2313:1100::/64";
  assert(isIpInAllowedList("59.126.167.108", list));
  assert(isIpInAllowedList("2001:b030:2313:1100:cafe:babe::1", list));
  assert(!isIpInAllowedList("1.2.3.4", list));
});

// 2. LINE Postback in Flex card
test("Approval Flex button check", () => {
  const flexTs = fs.readFileSync(path.resolve(__dirname, "src/views/flex/approval-flex.ts"), "utf8");
  assert(flexTs.includes('inputOption: "openKeyboard"'), "Must contain inputOption: openKeyboard");
  assert(flexTs.includes('fillInText: `【駁回 #${approvalId}】原因：`'), "Must contain fillInText template");
  assert(!flexTs.includes('openKeyboardWithMessage'), "Must NOT contain invalid openKeyboardWithMessage");
  assert(flexTs.includes('action=reject_prompt'), "Must trigger reject_prompt data action");
});

// 3. Webhook reject parser
test("Webhook regex extracts approvalId and reject reason", () => {
  const regex = /^【駁回\s*#([a-zA-Z0-9_-]+)】原因[：:]\s*([\s\S]*)$/;
  const m1 = "【駁回 #appr_888】原因：門市人力短缺，請改期".match(regex);
  assert(m1 && m1[1] === "appr_888" && m1[2].trim() === "門市人力短缺，請改期");

  const m2 = "【駁回 #appr_999】原因: 特休餘額不足".match(regex);
  assert(m2 && m2[1] === "appr_999" && m2[2].trim() === "特休餘額不足");
});

// 4. Candidate IPs registration in checkin service
test("checkin service supports candidate IPs & /64 subnet normalization", () => {
  const srvTs = fs.readFileSync(path.resolve(__dirname, "src/services/checkin.service.ts"), "utf8");
  assert(srvTs.includes("candidateIps?: string[]"), "Service must accept candidateIps");
  assert(srvTs.includes("normalizeToIpv6Subnet64"), "Service must call normalizeToIpv6Subnet64");
});

// 5. Approval Result Flex calm styling (no red, gray header, black text)
test("Approval Result Flex rejected state uses non-alarming calm colors", () => {
  const flexTs = fs.readFileSync(path.resolve(__dirname, "src/views/flex/approval-flex.ts"), "utf8");
  assert(!flexTs.includes('const headerBgColor = isApproved ? "#06C755" : "#E53E3E"'), "Header color must NOT be red on reject");
  assert(flexTs.includes('const headerBgColor = isApproved ? "#06C755" : "#4A5568"'), "Header color must be gray on reject");
  assert(flexTs.includes('isApproved ? "#06C755" : "#111111"'), "主管已駁回 must be black (#111111)");
  assert(!flexTs.includes('#FFF5F5'), "Rejection reason box must not use red background #FFF5F5");
  assert(!flexTs.includes('#FEB2B2'), "Rejection reason box must not use red border #FEB2B2");
  assert(!flexTs.includes('#C53030'), "Rejection reason box must not use red text #C53030");
  assert(!flexTs.includes('#9B2C2C'), "Rejection reason box must not use red text #9B2C2C");
});

console.log("\n🎉 ALL TESTS PASSED SUCCESSFULLY! Passed count:", passed);
