import { CheckinPayload, SwitchDevicePayload, LocationPayload, Env } from "../types";
import { CheckinRepository, CheckinRecordsFilter } from "../repositories/checkin.repo";
import { calculateHaversineDistance, autoGeocodeAddress } from "../utils/geo";
import { isValidTaiwanTaxId, decomposeLocation } from "../utils/taiwan";
import { isIpInAllowedList, isValidAllowedIpsFormat, normalizeToIpv6Subnet64 } from "../utils/network";
import { verifyLineIdToken } from "./auth.service";
import { pushCheckinReceipt } from "../views/flex/checkin-flex";

export interface CheckinResult {
  status: number;
  body: any;
}

export class CheckinService {
  constructor(private repo: CheckinRepository) {}

  /**
   * Core Punch & Verification State Machine.
   */
  async processCheckin(
    body: CheckinPayload,
    env: Env,
    clientIp: string,
    userAgent: string
  ): Promise<CheckinResult> {
    if (typeof body.latitude !== "number" || typeof body.longitude !== "number") {
      return {
        status: 400,
        body: { success: false, error: "缺少經緯度數值 (latitude/longitude)" }
      };
    }

    if (!body.deviceId) {
      return {
        status: 400,
        body: { success: false, error: "缺少裝置識別碼 (deviceId)" }
      };
    }

    // 1. Identify User ID & Name
    let userId = "";
    let userName = "";

    if (body.idToken && body.idToken !== "demo_token") {
      const verified = await verifyLineIdToken(body.idToken, env.LINE_LOGIN_CHANNEL_ID);
      if (!verified) {
        return {
          status: 401,
          body: { success: false, error: "LINE 身分驗證無效或 Token 已過期" }
        };
      }
      userId = verified.userId;
      userName = verified.name;
    } else {
      userId = body.fallbackUserId || "DEMO_USER";
      userName = body.fallbackDisplayName || "測試用戶";
    }

    // 2. Multi-Tenant Company Registration & Location Scoping
    const incomingId = body.companyId ? body.companyId.trim() : "";
    let companyTaxId = "";

    const existingEmp = await this.repo.getEmployeeCompany(userId);

    if (incomingId) {
      if (!isValidTaiwanTaxId(incomingId)) {
        return {
          status: 400,
          body: { success: false, error: `無效的統一編號/據點代碼 [${incomingId}]（未通過官方檢查碼驗證）` }
        };
      }
      companyTaxId = incomingId.split("-")[0];
      await this.repo.upsertEmployee(incomingId, userId, userName);
    } else if (existingEmp && existingEmp.company_id) {
      companyTaxId = existingEmp.company_id.split("-")[0];
    } else {
      return {
        status: 403,
        body: {
          success: false,
          code: "UNREGISTERED_EMPLOYEE",
          error: "尚未綁定所屬公司！初次使用請先掃描公司專屬的入職打卡 QR Code 完成註冊。"
        }
      };
    }

    // Fetch ONLY locations belonging strictly to this employee's company
    const companyLocations = await this.repo.getLocationsByTaxId(companyTaxId);

    if (!companyLocations || companyLocations.length === 0) {
      return {
        status: 400,
        body: { success: false, error: `所屬公司 [${companyTaxId}] 尚未註冊任何打卡據點，請向人事確認。` }
      };
    }

    let matchedLoc: any = null;
    let distance = 999999;

    if (incomingId && companyLocations.some((l: any) => l.id === incomingId)) {
      matchedLoc = companyLocations.find((l: any) => l.id === incomingId)!;
      distance = calculateHaversineDistance(body.latitude, body.longitude, matchedLoc.target_lat, matchedLoc.target_lon);
    } else {
      let nearestLoc = companyLocations[0];
      let minDistance = 999999;

      for (const loc of companyLocations) {
        const d = calculateHaversineDistance(body.latitude, body.longitude, loc.target_lat, loc.target_lon);
        if (d <= loc.allowed_radius) {
          matchedLoc = loc;
          distance = d;
          break;
        }
        if (d < minDistance) {
          minDistance = d;
          nearestLoc = loc;
        }
      }

      if (!matchedLoc) {
        matchedLoc = nearestLoc;
        distance = minDistance;
      }
    }

    const locationId = matchedLoc.id;
    const targetLat = matchedLoc.target_lat;
    const targetLon = matchedLoc.target_lon;
    const allowedRadius = matchedLoc.allowed_radius || 100;
    const locationName = matchedLoc.name;
    const locationAddress = matchedLoc.address;
    const locationAllowedIps = matchedLoc.allowed_ips ? matchedLoc.allowed_ips.trim() : null;

    // 4. Single Device Verification & Self-Service Device Switching
    const boundDevice = await this.repo.getUserDevice(userId);
    let deviceSwitched = false;

    if (!boundDevice) {
      await this.repo.bindInitialDevice(userId, body.deviceId, userAgent);
      await this.repo.logDeviceAudit(userId, userName, "INITIAL_BIND", null, body.deviceId, clientIp, userAgent, "INFO");
    } else if (boundDevice.device_id !== body.deviceId) {
      if (!body.confirmDeviceSwitch) {
        return {
          status: 409,
          body: {
            success: false,
            requireDeviceSwitchConfirm: true,
            code: "DEVICE_SWITCH_CONFIRM_REQUIRED",
            error: "偵測到更換打卡設備",
            message: "為防範代打卡，使用新手機打卡將解除舊設備綁定並通報人事部。是否確認換機打卡？"
          }
        };
      }

      await this.repo.switchUserDevice(userId, body.deviceId, userAgent);
      await this.repo.logDeviceAudit(userId, userName, "SWITCH_DEVICE", boundDevice.device_id, body.deviceId, clientIp, userAgent, "WARNING");
      deviceSwitched = true;
    }

    // 5. GPS Distance & IP Whitelist Complementary Verification
    distance = calculateHaversineDistance(body.latitude, body.longitude, targetLat, targetLon);

    const hasIpWhitelist = !!locationAllowedIps;
    const isIpMatched = hasIpWhitelist && isIpInAllowedList(clientIp, locationAllowedIps);

    let verifyMode: "IP_WHITELIST" | "GPS_FALLBACK" | "GPS_ONLY" = "GPS_ONLY";
    let isVerified = false;
    let verifyErrorMsg = "";

    if (hasIpWhitelist) {
      if (isIpMatched) {
        verifyMode = "IP_WHITELIST";
        isVerified = true;
      } else {
        verifyMode = "GPS_FALLBACK";
        if (distance <= allowedRadius) {
          isVerified = true;
        } else {
          isVerified = false;
          verifyErrorMsg = `打卡失敗：未連線至公司指定 Wi-Fi（偵測到連線 IP: ${clientIp}），且 GPS 定位超出允許範圍（目前距離 ${locationName} 約 ${distance.toFixed(0)} 公尺，允許半徑：${allowedRadius} 公尺）。`;
        }
      }
    } else {
      verifyMode = "GPS_ONLY";
      if (distance <= allowedRadius) {
        isVerified = true;
      } else {
        isVerified = false;
        verifyErrorMsg = `打卡失敗：GPS 定位超出範圍！目前距離 ${locationName} 約 ${distance.toFixed(0)} 公尺（允許半徑：${allowedRadius} 公尺）。本據點未配置公司 Wi-Fi 限制，請移至收訊良好處重試。`;
      }
    }

    // 5.5. Smart Clock-In / Clock-Out Inference State Machine
    const lastSuccess = await this.repo.getLastSuccessRecord(userId);

    let punchType: "IN" | "OUT" = "IN";
    let workHours: number | null = null;
    let isDuplicate = false;
    let prevCheckinTime: string | null = null;

    if (!lastSuccess) {
      punchType = "IN";
    } else {
      const deltaHours = typeof lastSuccess.delta_hours === "number" ? Math.max(0, lastSuccess.delta_hours) : 999;
      const deltaMinutes = deltaHours * 60;
      const lastType = lastSuccess.punch_type || "IN";

      if (deltaMinutes < 30) {
        isDuplicate = true;
        punchType = lastType as "IN" | "OUT";
        prevCheckinTime = lastSuccess.created_at;
      } else if (deltaHours > 18) {
        punchType = "IN";
      } else {
        if (lastType === "IN") {
          punchType = "OUT";
          workHours = parseFloat(deltaHours.toFixed(1));
        } else {
          punchType = "IN";
        }
      }
    }

    if (!isVerified) {
      try {
        await this.repo.insertCheckinRecord({
          company_id: locationId,
          line_user_id: userId,
          display_name: userName,
          device_id: body.deviceId,
          latitude: body.latitude,
          longitude: body.longitude,
          distance_meters: distance,
          status: "OUT_OF_RANGE",
          punch_type: punchType,
          work_hours: workHours,
          verify_mode: verifyMode
        });
      } catch (e) {
        console.error("DB insert error on failure:", e);
      }

      return {
        status: 400,
        body: {
          success: false,
          error: verifyErrorMsg,
          verifyMode,
          clientIp,
          locationId,
          locationName,
          address: locationAddress,
          distanceMeters: Math.round(distance),
          allowedRadius,
        }
      };
    }

    const recordStatus = isDuplicate ? "DUPLICATE" : "SUCCESS";

    // 6. Record Check-in in D1
    const lastRowId = await this.repo.insertCheckinRecord({
      company_id: locationId,
      line_user_id: userId,
      display_name: userName,
      device_id: body.deviceId,
      latitude: body.latitude,
      longitude: body.longitude,
      distance_meters: distance,
      status: recordStatus,
      punch_type: punchType,
      work_hours: workHours,
      verify_mode: verifyMode
    });

    const createdAt = await this.repo.getRecordCreatedAt(lastRowId);
    const checkinTime = createdAt || new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });

    // 7. Trigger LINE Flex Message push
    if (env.LINE_CHANNEL_ACCESS_TOKEN) {
      await pushCheckinReceipt(
        env.LINE_CHANNEL_ACCESS_TOKEN,
        userId,
        userName,
        checkinTime,
        distance,
        locationName,
        locationAddress,
        punchType,
        workHours,
        isDuplicate,
        lastRowId,
        prevCheckinTime || undefined,
        verifyMode
      );
    }

    const typeDesc = punchType === "IN" ? "上班" : "下班";
    const messageText = isDuplicate
      ? `您於 ${prevCheckinTime || checkinTime} 已經打卡成功`
      : `${typeDesc}打卡成功！` + (punchType === "OUT" && workHours !== null ? `（本次工時 ${workHours} 小時）` : "");

    return {
      status: 200,
      body: {
        success: true,
        message: messageText,
        userId,
        displayName: userName,
        punchType,
        workHours,
        verifyMode,
        clientIp,
        isDuplicate,
        prevCheckinTime,
        locationId,
        locationName,
        address: locationAddress,
        deviceId: body.deviceId.substring(0, 10) + "...",
        deviceSwitched,
        checkinTime,
        distanceMeters: Math.round(distance * 10) / 10,
      }
    };
  }

  /**
   * Switch and bind user device.
   */
  async switchDevice(
    body: SwitchDevicePayload,
    env: Env,
    clientIp: string,
    userAgent: string
  ): Promise<CheckinResult> {
    if (!body.deviceId) {
      return { status: 400, body: { success: false, error: "缺少 deviceId" } };
    }

    let userId = "";
    let userName = "";

    if (body.idToken && body.idToken !== "demo_token") {
      const verified = await verifyLineIdToken(body.idToken, env.LINE_LOGIN_CHANNEL_ID);
      if (!verified) {
        return { status: 401, body: { success: false, error: "身分驗證失敗" } };
      }
      userId = verified.userId;
      userName = verified.name;
    } else {
      userId = body.fallbackUserId || "DEMO_USER";
      userName = body.fallbackDisplayName || "測試用戶";
    }

    const currentBinding = await this.repo.getUserDevice(userId);
    const oldDeviceId = currentBinding ? currentBinding.device_id : null;

    await this.repo.upsertUserDevice(userId, body.deviceId, userAgent);
    await this.repo.logDeviceAudit(
      userId,
      userName,
      oldDeviceId ? "SWITCH_DEVICE" : "INITIAL_BIND",
      oldDeviceId,
      body.deviceId,
      clientIp,
      userAgent,
      oldDeviceId ? "WARNING" : "INFO"
    );

    return {
      status: 200,
      body: {
        success: true,
        message: "裝置已成功更換綁定，舊裝置已作廢。",
        userId,
        newDeviceId: body.deviceId,
        oldDeviceId: oldDeviceId
      }
    };
  }

  /**
   * Query records for tenant with optional CSV formatting.
   */
  async getTenantRecords(taxId: string, role: string, filters: CheckinRecordsFilter, format: string): Promise<{ isCsv: boolean; data: any }> {
    const results = await this.repo.getTenantRecords(taxId, filters);

    if (format === "csv") {
      let csv = "\uFEFF";
      csv += "紀錄序號,據點代碼,員工LINE_ID,員工姓名,打卡狀態,打卡類型,當段工時(小時),驗證方式,打卡時間,距離(公尺)\r\n";

      for (const r of results) {
        const pTypeStr = r.punch_type === "IN" ? "上班" : "下班";
        const vModeStr = r.verify_mode === "IP_WHITELIST" ? "公司Wi-Fi" : (r.verify_mode === "GPS_FALLBACK" ? "外網GPS" : "GPS");
        const wHoursStr = r.work_hours !== null && r.work_hours !== undefined ? r.work_hours.toString() : "";

        const line = [
          r.id,
          `"${(r.company_id || "").replace(/"/g, '""')}"`,
          `"${(r.line_user_id || "").replace(/"/g, '""')}"`,
          `"${(r.display_name || "").replace(/"/g, '""')}"`,
          `"${(r.status || "").replace(/"/g, '""')}"`,
          `"${pTypeStr}"`,
          `"${wHoursStr}"`,
          `"${vModeStr}"`,
          `"${r.created_at}"`,
          Math.round(r.distance_meters || 0)
        ].join(",");

        csv += line + "\r\n";
      }

      return { isCsv: true, data: csv };
    }

    return {
      isCsv: false,
      data: {
        success: true,
        companyTaxId: taxId,
        role,
        count: results.length,
        records: results
      }
    };
  }

  /**
   * Save or update location.
   */
  async saveLocation(body: LocationPayload): Promise<{ success: boolean; message: string; location: any }> {
    if (!body.id || !body.name || !body.address) {
      throw new Error("缺少必要參數 (id 統編[-分店號], name 據點名稱, address 中文地址)");
    }

    const cleanId = body.id.trim();

    if (!isValidTaiwanTaxId(cleanId)) {
      throw new Error(`代碼 [${cleanId}] 包含之統一編號無效！未通過台灣官方邏輯檢驗。`);
    }

    if (body.allowed_ips && !isValidAllowedIpsFormat(body.allowed_ips)) {
      throw new Error("allowed_ips 格式無效！請提供有效之 IP 或 CIDR 網段（例如 '211.20.1.5, 114.33.20.0/24'）");
    }

    const cleanAllowedIps = body.allowed_ips && body.allowed_ips.trim() ? body.allowed_ips.trim() : null;

    let targetLat = body.target_lat;
    let targetLon = body.target_lon;
    let isAutoGeocoded = false;

    if (typeof targetLat !== "number" || typeof targetLon !== "number") {
      const geo = await autoGeocodeAddress(body.address);
      if (!geo) {
        throw new Error(`無法自動解析地址 [${body.address}] 之 GPS 座標，請手動提供 target_lat 與 target_lon。`);
      }
      targetLat = geo.lat;
      targetLon = geo.lon;
      isAutoGeocoded = true;
    }

    const radius = body.allowed_radius || 100;

    await this.repo.upsertLocation({
      ...body,
      id: cleanId,
      target_lat: targetLat,
      target_lon: targetLon,
      allowed_radius: radius,
      allowed_ips: cleanAllowedIps,
    });

    const decomposed = decomposeLocation({
      id: cleanId,
      name: body.name.trim(),
      address: body.address.trim(),
      target_lat: targetLat,
      target_lon: targetLon,
      allowed_radius: radius,
      allowed_ips: cleanAllowedIps,
      manager_line_id: body.manager_line_id ? body.manager_line_id.trim() : null,
    });

    return {
      success: true,
      message: "據點已驗證並儲存" + (isAutoGeocoded ? " (已自動由地址轉換座標)" : ""),
      location: decomposed
    };
  }

  /**
   * Delete tenant branch location with safety guards.
   */
  async removeLocation(taxId: string, locationId: string): Promise<{ success: boolean; message: string }> {
    const cleanId = locationId.trim();
    const targetTaxId = cleanId.split("-")[0];
    if (targetTaxId !== taxId) {
      throw new Error(`權限越界：金鑰所屬統編為 [${taxId}]，無法操作 [${targetTaxId}] 之門市據點`);
    }

    if (cleanId === `${taxId}-01` || cleanId === taxId) {
      throw new Error("企業總部主要據點不可刪除");
    }

    const loc = await this.repo.getLocationById(cleanId);
    if (!loc) {
      throw new Error(`門市據點 [${cleanId}] 不存在`);
    }

    const boundEmpCount = await this.repo.countEmployeesByLocation(cleanId);
    if (boundEmpCount > 0) {
      throw new Error(`無法刪除：該門市尚有 ${boundEmpCount} 位在職員工綁定，請先至員工管理調整所屬門市後再刪除。`);
    }

    await this.repo.deleteLocation(cleanId);
    return { success: true, message: `門市據點 [${cleanId}] 已成功刪除` };
  }

  /**
   * Register client IP into location allowed_ips whitelist.
   * Supports Dual-Stack (IPv4 and IPv6 /64 prefix auto-normalization).
   */
  async registerLocationWifi(
    locationId: string,
    clientIp: string,
    candidateIps?: string[]
  ): Promise<{ success: boolean; message: string; allowedIps: string; addedIps: string[] }> {
    const loc = await this.repo.getLocationById(locationId);
    if (!loc) {
      throw new Error("門市不存在");
    }

    let existingIps = loc.allowed_ips ? loc.allowed_ips.split(",").map((ip: string) => ip.trim()).filter(Boolean) : [];
    const pool = [clientIp, ...(candidateIps || [])];
    const addedIps: string[] = [];

    for (const raw of pool) {
      if (!raw || typeof raw !== "string") continue;
      const clean = raw.trim();
      if (!clean || clean === "unknown") continue;

      let normalizedIp = clean;
      if (clean.includes(":")) {
        // IPv6 address: normalize single host address to /64 subnet prefix
        if (!clean.includes("/")) {
          const subnet = normalizeToIpv6Subnet64(clean);
          if (subnet) normalizedIp = subnet;
        }
      }

      if (!isValidAllowedIpsFormat(normalizedIp)) {
        continue;
      }

      if (!existingIps.includes(normalizedIp)) {
        existingIps.push(normalizedIp);
        addedIps.push(normalizedIp);
      }
    }

    const updatedIps = existingIps.join(", ");
    await this.repo.updateLocationWifi(locationId, updatedIps);

    const message = addedIps.length > 0
      ? `已成功將連線 IP/網段 [${addedIps.join(", ")}] 加入據點 [${loc.name}] 之 Wi-Fi 白名單`
      : `據點 [${loc.name}] 之 Wi-Fi 白名單已包含當前連線位址`;

    return {
      success: true,
      message,
      allowedIps: updatedIps,
      addedIps
    };
  }
}
