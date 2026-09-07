export interface TenantUserRecord {
  id: number;
  tax_id: string;
  username: string;
  password_hash: string;
  salt: string;
  display_name: string;
  role: string;
  is_active: number;
}

export interface TenantApiKeyRecord {
  id: number;
  tax_id: string;
  key_hint: string;
  name: string;
  role: string;
  is_active: number;
  created_at: string;
  last_used_at: string | null;
}

export interface TenantEmployeeRow {
  id: number;
  company_id: string;
  line_user_id: string;
  employee_name: string | null;
  approver_line_id: string | null;
  permissions: string | null;
  created_at: string;
  company_name: string | null;
  manager_line_id: string | null;
}

export class TenantRepository {
  constructor(private db: D1Database) {}

  // ==================== User & Session ====================

  async findUserByUsername(username: string): Promise<TenantUserRecord | null> {
    return await this.db.prepare(`
      SELECT id, tax_id, username, password_hash, salt, display_name, role, is_active
      FROM tenant_users
      WHERE username = ?
    `).bind(username).first<TenantUserRecord>();
  }

  async createSession(
    sessionHash: string,
    userId: number,
    taxId: string,
    role: string,
    expiresAt: string
  ): Promise<void> {
    await this.db.prepare(`
      INSERT INTO tenant_sessions (token_hash, user_id, tax_id, role, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(sessionHash, userId, taxId, role, expiresAt).run();
  }

  async updateUserLastLogin(userId: number): Promise<void> {
    await this.db.prepare(`
      UPDATE tenant_users SET last_login_at = datetime('now', '+8 hours') WHERE id = ?
    `).bind(userId).run();
  }

  async deleteSessionByHash(sessionHash: string): Promise<void> {
    await this.db.prepare("DELETE FROM tenant_sessions WHERE token_hash = ?").bind(sessionHash).run();
  }

  // ==================== Tenant M2M API Keys ====================

  async listApiKeys(taxId: string): Promise<TenantApiKeyRecord[]> {
    const { results } = await this.db.prepare(`
      SELECT id, tax_id, key_hint, name, role, is_active, created_at, last_used_at
      FROM tenant_api_keys
      WHERE tax_id = ?
      ORDER BY id DESC
    `).bind(taxId).all();
    return (results as unknown as TenantApiKeyRecord[]) || [];
  }

  async createApiKey(
    taxId: string,
    keyHash: string,
    keyHint: string,
    name: string,
    role: string
  ): Promise<void> {
    await this.db.prepare(`
      INSERT INTO tenant_api_keys (tax_id, api_key_hash, key_hint, name, role, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `).bind(taxId, keyHash, keyHint, name, role).run();
  }

  async revokeApiKey(keyId: number, taxId: string): Promise<boolean> {
    const res = await this.db.prepare(`
      UPDATE tenant_api_keys
      SET is_active = 0
      WHERE id = ? AND tax_id = ?
    `).bind(keyId, taxId).run();
    return (res.meta.changes || 0) > 0;
  }

  // ==================== Employee PBAC & Profiles ====================

  async listEmployees(taxId: string): Promise<TenantEmployeeRow[]> {
    const { results } = await this.db.prepare(`
      SELECT ce.id, ce.company_id, ce.line_user_id, ce.employee_name, ce.approver_line_id, ce.permissions, ce.created_at,
             l.name as company_name, l.manager_line_id
      FROM company_employees ce
      LEFT JOIN locations l ON ce.company_id = l.id
      WHERE (ce.company_id = ? OR ce.company_id LIKE ?)
      ORDER BY ce.id DESC
    `).bind(taxId, `${taxId}-%`).all();
    return (results as unknown as TenantEmployeeRow[]) || [];
  }

  async upsertEmployeePermissions(
    effectiveCompanyId: string,
    lineUserId: string,
    employeeName: string | null,
    permStr: string
  ): Promise<void> {
    await this.db.prepare(`
      INSERT INTO company_employees (company_id, line_user_id, employee_name, permissions)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(line_user_id) DO UPDATE SET
        company_id = excluded.company_id,
        employee_name = COALESCE(excluded.employee_name, company_employees.employee_name),
        permissions = excluded.permissions
    `).bind(effectiveCompanyId, lineUserId.trim(), employeeName || null, permStr).run();
  }

  async isStoreManager(lineUserId: string): Promise<boolean> {
    const row = await this.db.prepare("SELECT 1 FROM locations WHERE manager_line_id = ? LIMIT 1")
      .bind(lineUserId.trim())
      .first();
    return !!row;
  }

  async listEmployeesForSync(taxId: string): Promise<{ line_user_id: string; permissions: string | null; manager_line_id: string | null }[]> {
    const { results } = await this.db.prepare(`
      SELECT ce.line_user_id, ce.permissions, l.manager_line_id
      FROM company_employees ce
      LEFT JOIN locations l ON ce.company_id = l.id
      WHERE ce.company_id = ? OR ce.company_id LIKE ?
    `).bind(taxId, `${taxId}-%`).all();
    return (results as any[]) || [];
  }

  async findEmployeeWithLocation(lineUserId: string): Promise<{
    company_id: string;
    employee_name: string | null;
    permissions: string | null;
    company_name: string | null;
    manager_line_id: string | null;
  } | null> {
    return await this.db.prepare(`
      SELECT ce.company_id, ce.employee_name, ce.permissions, l.name as company_name, l.manager_line_id
      FROM company_employees ce
      LEFT JOIN locations l ON ce.company_id = l.id
      WHERE ce.line_user_id = ?
    `).bind(lineUserId).first();
  }

  async findLocationByManager(lineUserId: string): Promise<{ id: string; name: string } | null> {
    return await this.db.prepare(
      "SELECT id, name FROM locations WHERE manager_line_id = ? LIMIT 1"
    ).bind(lineUserId).first<{ id: string; name: string }>();
  }

  async findLocationById(companyId: string): Promise<{ id: string; name: string; address: string } | null> {
    return await this.db.prepare(
      "SELECT id, name, address FROM locations WHERE id = ?"
    ).bind(companyId).first<{ id: string; name: string; address: string }>();
  }

  async joinEmployee(companyId: string, lineUserId: string, displayName: string): Promise<void> {
    await this.db.prepare(`
      INSERT INTO company_employees (company_id, line_user_id, employee_name, permissions)
      VALUES (?, ?, ?, '["punch","apply"]')
      ON CONFLICT(line_user_id) DO UPDATE SET
        company_id = excluded.company_id,
        employee_name = excluded.employee_name
    `).bind(companyId, lineUserId, displayName).run();
  }

  async logAudit(
    lineUserId: string,
    displayName: string,
    action: string,
    newDeviceId?: string | null,
    warningLevel: string = "INFO"
  ): Promise<void> {
    try {
      await this.db.prepare(`
        INSERT INTO device_audit_logs (line_user_id, display_name, action, new_device_id, warning_level)
        VALUES (?, ?, ?, ?, ?)
      `).bind(lineUserId, displayName, action, newDeviceId || null, warningLevel).run();
    } catch (e) {}
  }
}
