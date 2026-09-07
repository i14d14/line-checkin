import { PayslipItem, PayslipDispatchFailure, PayslipDispatchResponse } from "../types";
import { PayrollRepository } from "../repositories/payroll.repo";
import { pushPayslipMessage } from "../views/flex/payslip-flex";

/**
 * Payroll Domain Service
 * Handles E-Payslip template generation, validation, cross-tenant isolation, and privacy-masked dispatch.
 */
export class PayrollService {
  constructor(private repo: PayrollRepository) {}

  /**
   * Generates a standard UTF-8 BOM CSV template for employee payslip import.
   */
  generatePayslipCsvTemplate(): string {
    let csv = "\uFEFF";
    csv += "line_user_id,employee_name,pay_month,base_salary,allowances,overtime_pay,deductions,net_salary,note\r\n";
    csv += `"Ubd107bb3ba1b85a8086fc3b2250458e8","王大明","2026-08",45000,3000,2500,2100,48400,"績效優異獎金"\r\n`;
    csv += `"Uce208cc4cb2c96b9197fd4c3361569f9","李小華","2026-08",38000,2000,0,1950,38050,"無"\r\n`;
    return csv;
  }

  /**
   * Performs server-side validation on payslip records and enforces tenant isolation.
   */
  async validatePayslips(
    taxId: string,
    rawItems: any[]
  ): Promise<{ validated: PayslipItem[]; failures: PayslipDispatchFailure[] }> {
    const failures: PayslipDispatchFailure[] = [];
    const validated: PayslipItem[] = [];

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return {
        validated: [],
        failures: [{ reason: "未提供任何薪資資料" }]
      };
    }

    // 1. Fetch all authorized employees of this tenant to prevent cross-tenant leakage
    const activeEmployees = await this.repo.getTenantActiveEmployees(taxId);
    const authorizedUserMap = new Map<string, string>();
    for (const emp of activeEmployees) {
      authorizedUserMap.set(emp.line_user_id, emp.employee_name);
    }

    // 2. Validate row formats, numbers, and tenant authorization
    for (let i = 0; i < rawItems.length; i++) {
      const rowNum = i + 1;
      const raw = rawItems[i];

      if (!raw || typeof raw !== "object") {
        failures.push({ row: rowNum, reason: "第 " + rowNum + " 列格式錯誤：非有效物件" });
        continue;
      }

      const lineUserId = typeof raw.line_user_id === "string" ? raw.line_user_id.trim() : "";
      const employeeName = typeof raw.employee_name === "string" ? raw.employee_name.trim() : "";
      const payMonth = typeof raw.pay_month === "string" ? raw.pay_month.trim() : "";

      if (!lineUserId) {
        failures.push({ row: rowNum, reason: `第 ${rowNum} 列缺少員工 LINE User ID` });
        continue;
      }

      // Check cross-tenant isolation: Target user must belong to this tenant's company_employees
      if (!authorizedUserMap.has(lineUserId)) {
        failures.push({
          row: rowNum,
          line_user_id: lineUserId,
          reason: `員工 ${lineUserId} (${employeeName || "未知"}) 非本企業在職同仁，禁止跨租戶發送薪資條`
        });
        continue;
      }

      if (!employeeName) {
        failures.push({ row: rowNum, line_user_id: lineUserId, reason: `第 ${rowNum} 列缺少員工姓名` });
        continue;
      }

      if (!payMonth || !/^\d{4}[-/]\d{1,2}$/.test(payMonth)) {
        failures.push({ row: rowNum, line_user_id: lineUserId, reason: `第 ${rowNum} 列計薪月份格式無效 (應為 YYYY-MM，如 2026-08)` });
        continue;
      }

      const baseSalary = Number(raw.base_salary);
      const allowances = raw.allowances !== undefined && raw.allowances !== null && raw.allowances !== "" ? Number(raw.allowances) : 0;
      const overtimePay = raw.overtime_pay !== undefined && raw.overtime_pay !== null && raw.overtime_pay !== "" ? Number(raw.overtime_pay) : 0;
      const deductions = raw.deductions !== undefined && raw.deductions !== null && raw.deductions !== "" ? Number(raw.deductions) : 0;
      const netSalary = Number(raw.net_salary);

      if (isNaN(baseSalary) || baseSalary < 0) {
        failures.push({ row: rowNum, line_user_id: lineUserId, reason: `第 ${rowNum} 列底薪 (base_salary) 必須為有效且非負數值` });
        continue;
      }

      if (isNaN(allowances) || allowances < 0) {
        failures.push({ row: rowNum, line_user_id: lineUserId, reason: `第 ${rowNum} 列津貼 (allowances) 必須為有效且非負數值` });
        continue;
      }

      if (isNaN(overtimePay) || overtimePay < 0) {
        failures.push({ row: rowNum, line_user_id: lineUserId, reason: `第 ${rowNum} 列加班費 (overtime_pay) 必須為有效且非負數值` });
        continue;
      }

      if (isNaN(deductions) || deductions < 0) {
        failures.push({ row: rowNum, line_user_id: lineUserId, reason: `第 ${rowNum} 列扣款 (deductions) 必須為有效且非負數值` });
        continue;
      }

      if (isNaN(netSalary)) {
        failures.push({ row: rowNum, line_user_id: lineUserId, reason: `第 ${rowNum} 列實發金額 (net_salary) 必須為有效數值` });
        continue;
      }

      validated.push({
        line_user_id: lineUserId,
        employee_name: employeeName,
        pay_month: payMonth,
        base_salary: baseSalary,
        allowances,
        overtime_pay: overtimePay,
        deductions,
        net_salary: netSalary,
        note: typeof raw.note === "string" ? raw.note.trim() : undefined
      });
    }

    return { validated, failures };
  }

  /**
   * Dispatches payslips to verified employees via LINE Messaging API and logs audit records.
   */
  async dispatchPayslips(
    accessToken: string,
    taxId: string,
    rawItems: any[],
    clientIp?: string,
    userAgent?: string
  ): Promise<PayslipDispatchResponse> {
    const { validated, failures } = await this.validatePayslips(taxId, rawItems);

    let successCount = 0;

    for (const item of validated) {
      const pushed = await pushPayslipMessage(accessToken, item.line_user_id, item);

      if (pushed) {
        successCount++;
        await this.repo.recordPayslipAuditLog(
          item.line_user_id,
          item.employee_name,
          clientIp,
          userAgent
        );
      } else {
        failures.push({
          line_user_id: item.line_user_id,
          reason: `LINE 訊息推播失敗 (可能為無效之 LINE User ID 或該員工未加入企業官方帳號好友)`
        });
      }
    }

    return {
      success: successCount > 0,
      count: successCount,
      failures
    };
  }
}
