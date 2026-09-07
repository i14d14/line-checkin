/**
 * Payroll Repository
 * Handles D1 queries for tenant employee verification and audit logging.
 */
export class PayrollRepository {
  constructor(private db: D1Database) {}

  /**
   * Get all active employees under the tenant's company/tax ID.
   * Matches either exact company_id (taxId) or branch prefix (taxId-%).
   */
  async getTenantActiveEmployees(taxId: string): Promise<{ line_user_id: string; employee_name: string }[]> {
    const { results } = await this.db.prepare(`
      SELECT DISTINCT line_user_id, COALESCE(employee_name, '') as employee_name
      FROM company_employees
      WHERE company_id = ? OR company_id LIKE ?
    `).bind(taxId, `${taxId}-%`).all<{ line_user_id: string; employee_name: string }>();

    return (results || []).map(r => ({
      line_user_id: r.line_user_id,
      employee_name: r.employee_name || ""
    }));
  }

  /**
   * Record payslip dispatch event in device_audit_logs for security & audit trails.
   */
  async recordPayslipAuditLog(
    lineUserId: string,
    employeeName: string,
    clientIp?: string,
    userAgent?: string
  ): Promise<void> {
    try {
      await this.db.prepare(`
        INSERT INTO device_audit_logs (line_user_id, display_name, action, ip_address, user_agent, warning_level)
        VALUES (?, ?, 'PAYSLIP_DISPATCHED', ?, ?, 'INFO')
      `).bind(
        lineUserId,
        employeeName || "員工",
        clientIp || "unknown",
        userAgent || "Client-Admin-Portal"
      ).run();
    } catch (err) {
      console.error("Failed to record payslip dispatch audit log:", err);
    }
  }
}
