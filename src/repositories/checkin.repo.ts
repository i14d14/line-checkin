import { LocationPayload } from "../types";

export interface CheckinRecordInsert {
  company_id: string;
  line_user_id: string;
  display_name: string;
  device_id: string;
  latitude: number;
  longitude: number;
  distance_meters: number;
  status: string;
  punch_type: string;
  work_hours: number | null;
  verify_mode: string;
}

export interface CheckinRecordsFilter {
  startDate?: string | null;
  endDate?: string | null;
  status?: string | null;
  punchType?: string | null;
  limit?: number;
}

export class CheckinRepository {
  constructor(private db: D1Database) {}

  // ==================== Location Operations ====================

  async getLocationById(id: string): Promise<any | null> {
    return this.db.prepare(
      "SELECT id, name, address, target_lat, target_lon, allowed_radius, allowed_ips, manager_line_id, created_at FROM locations WHERE id = ?"
    ).bind(id).first();
  }

  async getLocationsByTaxId(taxId: string): Promise<any[]> {
    const { results } = await this.db.prepare(
      "SELECT id, name, address, target_lat, target_lon, allowed_radius, allowed_ips, manager_line_id, created_at FROM locations WHERE id = ? OR id LIKE ? ORDER BY id ASC"
    ).bind(taxId, `${taxId}-%`).all();
    return results || [];
  }

  async getAllLocations(taxIdPrefix?: string | null): Promise<any[]> {
    let query = "SELECT id, name, address, target_lat, target_lon, allowed_radius, allowed_ips, created_at FROM locations";
    const params: string[] = [];

    if (taxIdPrefix) {
      query += " WHERE id LIKE ?";
      params.push(`${taxIdPrefix}%`);
    }

    query += " ORDER BY id ASC";
    const stmt = this.db.prepare(query);
    const { results } = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();
    return results || [];
  }

  async upsertLocation(loc: LocationPayload): Promise<void> {
    const radius = loc.allowed_radius || 100;
    const allowedIps = loc.allowed_ips ? loc.allowed_ips.trim() : null;
    const managerId = loc.manager_line_id ? loc.manager_line_id.trim() : null;

    await this.db.prepare(`
      INSERT INTO locations (id, name, address, target_lat, target_lon, allowed_radius, allowed_ips, manager_line_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        address = excluded.address,
        target_lat = excluded.target_lat,
        target_lon = excluded.target_lon,
        allowed_radius = excluded.allowed_radius,
        allowed_ips = excluded.allowed_ips,
        manager_line_id = excluded.manager_line_id
    `).bind(
      loc.id.trim(),
      loc.name.trim(),
      loc.address.trim(),
      loc.target_lat,
      loc.target_lon,
      radius,
      allowedIps,
      managerId
    ).run();
  }

  async updateLocationWifi(locationId: string, allowedIps: string): Promise<void> {
    await this.db.prepare(
      "UPDATE locations SET allowed_ips = ? WHERE id = ?"
    ).bind(allowedIps, locationId).run();
  }

  async countEmployeesByLocation(locationId: string): Promise<number> {
    const row = await this.db.prepare(
      "SELECT COUNT(*) as cnt FROM company_employees WHERE company_id = ?"
    ).bind(locationId).first<{ cnt: number }>();
    return row?.cnt || 0;
  }

  async deleteLocation(locationId: string): Promise<void> {
    await this.db.prepare(
      "DELETE FROM locations WHERE id = ?"
    ).bind(locationId).run();
  }

  // ==================== Employee Operations ====================

  async getEmployeeCompany(userId: string): Promise<{ company_id: string } | null> {
    return this.db.prepare(
      "SELECT company_id FROM company_employees WHERE line_user_id = ?"
    ).bind(userId).first<{ company_id: string }>();
  }

  async upsertEmployee(companyId: string, userId: string, userName: string): Promise<void> {
    await this.db.prepare(`
      INSERT INTO company_employees (company_id, line_user_id, employee_name)
      VALUES (?, ?, ?)
      ON CONFLICT(line_user_id) DO UPDATE SET
        company_id = excluded.company_id,
        employee_name = excluded.employee_name
    `).bind(companyId, userId, userName).run();
  }

  // ==================== Device Operations ====================

  async getUserDevice(userId: string): Promise<{ device_id: string } | null> {
    return this.db.prepare(
      "SELECT device_id FROM user_devices WHERE line_user_id = ?"
    ).bind(userId).first<{ device_id: string }>();
  }

  async bindInitialDevice(userId: string, deviceId: string, userAgent: string): Promise<void> {
    await this.db.prepare(
      "INSERT INTO user_devices (line_user_id, device_id, device_name) VALUES (?, ?, ?)"
    ).bind(userId, deviceId, userAgent).run();
  }

  async switchUserDevice(userId: string, deviceId: string, userAgent: string): Promise<void> {
    await this.db.prepare(`
      UPDATE user_devices 
      SET device_id = ?, device_name = ?, updated_at = datetime('now', '+8 hours') 
      WHERE line_user_id = ?
    `).bind(deviceId, userAgent, userId).run();
  }

  async upsertUserDevice(userId: string, deviceId: string, userAgent: string): Promise<void> {
    await this.db.prepare(`
      INSERT INTO user_devices (line_user_id, device_id, device_name, updated_at)
      VALUES (?, ?, ?, datetime('now', '+8 hours'))
      ON CONFLICT(line_user_id) DO UPDATE SET
        device_id = excluded.device_id,
        updated_at = datetime('now', '+8 hours')
    `).bind(userId, deviceId, userAgent).run();
  }

  async logDeviceAudit(
    userId: string,
    userName: string,
    action: string,
    oldDeviceId: string | null,
    newDeviceId: string | null,
    clientIp: string,
    userAgent: string,
    warningLevel: string
  ): Promise<void> {
    await this.db.prepare(`
      INSERT INTO device_audit_logs (line_user_id, display_name, action, old_device_id, new_device_id, ip_address, user_agent, warning_level)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(userId, userName, action, oldDeviceId, newDeviceId, clientIp, userAgent, warningLevel).run();
  }

  async getTenantAuditLogs(taxId: string, limit: number = 50): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT a.id, a.line_user_id, a.display_name, a.action, a.old_device_id, a.new_device_id, a.ip_address, a.warning_level, a.created_at
      FROM device_audit_logs a
      JOIN company_employees e ON a.line_user_id = e.line_user_id
      WHERE e.company_id = ? OR e.company_id LIKE ?
      ORDER BY a.id DESC LIMIT ?
    `).bind(taxId, `${taxId}-%`, limit).all();
    return results || [];
  }

  async getLegacyAuditLogs(limit: number = 20): Promise<any[]> {
    const { results } = await this.db.prepare(
      "SELECT id, line_user_id, display_name, action, old_device_id, new_device_id, ip_address, warning_level, created_at FROM device_audit_logs ORDER BY id DESC LIMIT ?"
    ).bind(limit).all();
    return results || [];
  }

  // ==================== Checkin Records Operations ====================

  async getLastSuccessRecord(userId: string): Promise<{ id: number; punch_type: string; created_at: string; delta_hours: number | null } | null> {
    return this.db.prepare(`
      SELECT id, punch_type, created_at,
             (julianday('now', '+8 hours') - julianday(created_at)) * 24 AS delta_hours
      FROM checkin_records
      WHERE line_user_id = ? AND status = 'SUCCESS'
      ORDER BY id DESC LIMIT 1
    `).bind(userId).first<{ id: number; punch_type: string; created_at: string; delta_hours: number | null }>();
  }

  async insertCheckinRecord(record: CheckinRecordInsert): Promise<number> {
    const res = await this.db.prepare(
      "INSERT INTO checkin_records (company_id, line_user_id, display_name, device_id, latitude, longitude, distance_meters, status, punch_type, work_hours, verify_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      record.company_id,
      record.line_user_id,
      record.display_name,
      record.device_id,
      record.latitude,
      record.longitude,
      record.distance_meters,
      record.status,
      record.punch_type,
      record.work_hours,
      record.verify_mode
    ).run();

    return res.meta.last_row_id;
  }

  async getRecordCreatedAt(recordId: number): Promise<string | null> {
    const record = await this.db.prepare(
      "SELECT created_at FROM checkin_records WHERE id = ?"
    ).bind(recordId).first<{ created_at: string }>();
    return record?.created_at || null;
  }

  async getTenantRecords(taxId: string, filters: CheckinRecordsFilter): Promise<any[]> {
    let sql = "SELECT id, company_id, line_user_id, display_name, device_id, latitude, longitude, distance_meters, status, punch_type, work_hours, verify_mode, created_at FROM checkin_records WHERE (company_id = ? OR company_id LIKE ?)";
    const params: any[] = [taxId, `${taxId}-%`];

    if (filters.startDate) {
      sql += " AND created_at >= ?";
      params.push(`${filters.startDate} 00:00:00`);
    }
    if (filters.endDate) {
      sql += " AND created_at <= ?";
      params.push(`${filters.endDate} 23:59:59`);
    }
    if (filters.status) {
      sql += " AND status = ?";
      params.push(filters.status.trim());
    }
    if (filters.punchType) {
      sql += " AND punch_type = ?";
      params.push(filters.punchType.trim());
    }

    const limit = filters.limit || 100;
    sql += " ORDER BY id DESC LIMIT ?";
    params.push(limit);

    const { results } = await this.db.prepare(sql).bind(...params).all();
    return results || [];
  }

  async getLegacyRecords(limit: number = 20): Promise<any[]> {
    const { results } = await this.db.prepare(
      "SELECT id, company_id, line_user_id, display_name, device_id, latitude, longitude, distance_meters, status, punch_type, work_hours, verify_mode, created_at FROM checkin_records ORDER BY id DESC LIMIT ?"
    ).bind(limit).all();
    return results || [];
  }

  async getCompanyRecords(taxId: string, limit: number = 50): Promise<any[]> {
    const { results } = await this.db.prepare(
      "SELECT id, company_id, line_user_id, display_name, device_id, latitude, longitude, distance_meters, status, punch_type, work_hours, created_at FROM checkin_records WHERE company_id LIKE ? ORDER BY id DESC LIMIT ?"
    ).bind(`${taxId}%`, limit).all();
    return results || [];
  }
}
