import { AnnouncementRecord, AnnouncementDetailResponse } from "../types";

export interface CreateAnnouncementParams {
  id: string;
  companyId: string;
  title: string;
  content: string;
  authorName: string;
}

export class AnnouncementRepository {
  constructor(private db: D1Database) {}

  /**
   * Create new announcement record
   */
  async createAnnouncement(params: CreateAnnouncementParams): Promise<void> {
    await this.db.prepare(`
      INSERT INTO announcements (id, company_id, title, content, author_name)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      params.id,
      params.companyId,
      params.title.trim(),
      params.content.trim(),
      params.authorName.trim()
    ).run();
  }

  /**
   * Retrieve single announcement by ID
   */
  async getAnnouncementById(id: string): Promise<AnnouncementRecord | null> {
    const record = await this.db.prepare(`
      SELECT id, company_id, title, content, author_name, created_at
      FROM announcements
      WHERE id = ?
    `).bind(id).first<AnnouncementRecord>();

    return record || null;
  }

  /**
   * Get count of unique active employees for a company/taxId
   */
  async getCompanyEmployeeCount(companyId: string): Promise<number> {
    const res = await this.db.prepare(`
      SELECT COUNT(DISTINCT line_user_id) as cnt
      FROM company_employees
      WHERE company_id = ? OR company_id LIKE ?
    `).bind(companyId, `${companyId}-%`).first<{ cnt: number }>();

    return res?.cnt || 0;
  }

  /**
   * List announcements for a company with computed read rates
   */
  async listAnnouncementsByCompany(companyId: string): Promise<AnnouncementRecord[]> {
    const totalEmployees = await this.getCompanyEmployeeCount(companyId);

    const { results } = await this.db.prepare(`
      SELECT 
        a.id,
        a.company_id,
        a.title,
        a.content,
        a.author_name,
        a.created_at,
        COUNT(ar.line_user_id) as read_count
      FROM announcements a
      LEFT JOIN announcement_reads ar ON a.id = ar.announcement_id
      WHERE a.company_id = ? OR a.company_id LIKE ?
      GROUP BY a.id
      ORDER BY a.created_at DESC
      LIMIT 100
    `).bind(companyId, `${companyId}-%`).all();

    const list = (results as any[]) || [];
    return list.map(item => {
      const readCount = Number(item.read_count) || 0;
      const readRate = totalEmployees > 0 ? Math.round((readCount / totalEmployees) * 100) : 0;
      return {
        id: item.id,
        company_id: item.company_id,
        title: item.title,
        content: item.content,
        author_name: item.author_name,
        created_at: item.created_at,
        total_recipients: totalEmployees,
        read_count: readCount,
        read_rate: readRate
      };
    });
  }

  /**
   * Record read receipt acknowledgement with strict idempotency (INSERT OR IGNORE)
   */
  async recordReadReceipt(
    announcementId: string,
    lineUserId: string
  ): Promise<{ success: boolean; isFirstTime: boolean; announcementTitle: string; readAt: string }> {
    const announcement = await this.getAnnouncementById(announcementId);
    if (!announcement) {
      return { success: false, isFirstTime: false, announcementTitle: "", readAt: "" };
    }

    const res = await this.db.prepare(`
      INSERT OR IGNORE INTO announcement_reads (announcement_id, line_user_id)
      VALUES (?, ?)
    `).bind(announcementId, lineUserId.trim()).run();

    const changes = res.meta?.changes || 0;

    if (changes > 0) {
      // First-time signature
      const readRow = await this.db.prepare(`
        SELECT read_at FROM announcement_reads WHERE announcement_id = ? AND line_user_id = ?
      `).bind(announcementId, lineUserId.trim()).first<{ read_at: string }>();

      return {
        success: true,
        isFirstTime: true,
        announcementTitle: announcement.title,
        readAt: readRow?.read_at || new Date().toISOString()
      };
    } else {
      // Already signed previously
      const readRow = await this.db.prepare(`
        SELECT read_at FROM announcement_reads WHERE announcement_id = ? AND line_user_id = ?
      `).bind(announcementId, lineUserId.trim()).first<{ read_at: string }>();

      return {
        success: true,
        isFirstTime: false,
        announcementTitle: announcement.title,
        readAt: readRow?.read_at || ""
      };
    }
  }

  /**
   * Get detailed reading statistics and employee lists (signed vs unsigned)
   */
  async getAnnouncementDetailsAndRecipients(
    announcementId: string,
    companyId: string
  ): Promise<AnnouncementDetailResponse | null> {
    const announcement = await this.getAnnouncementById(announcementId);
    if (!announcement) return null;

    // Verify tenant ownership
    if (announcement.company_id !== companyId && !announcement.company_id.startsWith(`${companyId}-`)) {
      return null;
    }

    // 1. Fetch all company employees
    const { results: empResults } = await this.db.prepare(`
      SELECT DISTINCT line_user_id, employee_name
      FROM company_employees
      WHERE company_id = ? OR company_id LIKE ?
      ORDER BY employee_name ASC
    `).bind(companyId, `${companyId}-%`).all();

    const employees = (empResults as any[]) || [];

    // 2. Fetch all read receipts for this announcement
    const { results: readResults } = await this.db.prepare(`
      SELECT line_user_id, read_at
      FROM announcement_reads
      WHERE announcement_id = ?
    `).bind(announcementId).all();

    const readsMap = new Map<string, string>();
    for (const r of (readResults as any[]) || []) {
      readsMap.set(r.line_user_id, r.read_at);
    }

    // 3. Partition into signed and unsigned lists
    const reads: AnnouncementDetailResponse["reads"] = [];
    const unreads: AnnouncementDetailResponse["unreads"] = [];

    for (const emp of employees) {
      const readAt = readsMap.get(emp.line_user_id);
      if (readAt) {
        reads.push({
          line_user_id: emp.line_user_id,
          employee_name: emp.employee_name || null,
          read_at: readAt
        });
      } else {
        unreads.push({
          line_user_id: emp.line_user_id,
          employee_name: emp.employee_name || null
        });
      }
    }

    const total = employees.length;
    const read = reads.length;
    const unread = unreads.length;
    const readRate = total > 0 ? Math.round((read / total) * 100) : 0;

    return {
      announcement: {
        ...announcement,
        total_recipients: total,
        read_count: read,
        read_rate: readRate
      },
      stats: {
        total,
        read,
        unread,
        readRate
      },
      reads,
      unreads
    };
  }

  /**
   * Get all active employee LINE User IDs for multicast
   */
  async getCompanyEmployeeUserIds(companyId: string): Promise<string[]> {
    const { results } = await this.db.prepare(`
      SELECT DISTINCT line_user_id
      FROM company_employees
      WHERE company_id = ? OR company_id LIKE ?
    `).bind(companyId, `${companyId}-%`).all();

    return ((results as any[]) || []).map(r => r.line_user_id).filter(Boolean);
  }

  /**
   * Get unread employee LINE User IDs for reminder multicast
   */
  async getUnreadEmployeeUserIds(announcementId: string, companyId: string): Promise<string[]> {
    const { results } = await this.db.prepare(`
      SELECT DISTINCT ce.line_user_id
      FROM company_employees ce
      LEFT JOIN announcement_reads ar ON ar.announcement_id = ? AND ar.line_user_id = ce.line_user_id
      WHERE (ce.company_id = ? OR ce.company_id LIKE ?)
        AND ar.line_user_id IS NULL
    `).bind(announcementId, companyId, `${companyId}-%`).all();

    return ((results as any[]) || []).map(r => r.line_user_id).filter(Boolean);
  }
}
