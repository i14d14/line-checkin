// 台灣統一編號官方檢驗演算法 + 測試沙盒統編放行
export function isValidTaiwanTaxId(taxId: string): boolean {
  if (!taxId || typeof taxId !== "string") return false;
  
  const cleanId = taxId.trim().split("-")[0];
  if (!/^\d{8}$/.test(cleanId)) return false;

  // 放行專用沙盒統編 (QA Sandbox)
  if (cleanId === "00000000" || cleanId === "99999999") return true;

  const weights = [1, 2, 1, 2, 1, 2, 4, 1];
  let sum = 0;

  for (let i = 0; i < 8; i++) {
    const digit = parseInt(cleanId[i], 10);
    const product = digit * weights[i];
    sum += Math.floor(product / 10) + (product % 10);
  }

  if (sum % 5 === 0) return true;

  if (cleanId[6] === "7") {
    if ((sum - 9) % 5 === 0 || (sum + 1) % 5 === 0) return true;
  }

  return false;
}

// 複合性資料拆解工具 (Decomposition Helper)
export function decomposeLocation(loc: any) {
  const id = loc.id || "";
  const name = loc.name || "";
  
  const hasHyphen = id.includes("-");
  const taxId = hasHyphen ? id.split("-")[0] : id;
  const branchCode = hasHyphen ? id.split("-").slice(1).join("-") : "HQ";

  const hasNameSplit = name.includes(" - ");
  const companyName = hasNameSplit ? name.split(" - ")[0] : name;
  const branchName = hasNameSplit ? name.split(" - ").slice(1).join(" - ") : "總部";

  const allowedIps = loc.allowed_ips ? loc.allowed_ips.trim() : null;

  return {
    id: loc.id,
    taxId,
    branchCode,
    name: loc.name,
    companyName,
    branchName,
    address: loc.address || "",
    target_lat: loc.target_lat,
    target_lon: loc.target_lon,
    allowed_radius: loc.allowed_radius || 100,
    allowed_ips: allowedIps,
    has_ip_whitelist: !!allowedIps,
    manager_line_id: loc.manager_line_id || null,
    created_at: loc.created_at
  };
}
