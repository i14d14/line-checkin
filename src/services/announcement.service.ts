import { Env, AnnouncementRecord, CreateAnnouncementPayload, AnnouncementDetailResponse } from "../types";
import { AnnouncementRepository } from "../repositories/announcement.repo";
import { buildAnnouncementFlexBubble } from "../views/flex/announcement-flex";

export class AnnouncementService {
  private repo: AnnouncementRepository;

  constructor(private env: Env, repo?: AnnouncementRepository) {
    this.repo = repo || new AnnouncementRepository(env.DB);
  }

  /**
   * Slice user IDs into chunks of 500 and dispatch LINE Multicast
   */
  async dispatchMulticast(
    accessToken: string,
    targetUserIds: string[],
    flexBubble: any,
    altText: string
  ): Promise<{ successCount: number; failureCount: number }> {
    if (!accessToken || !targetUserIds || targetUserIds.length === 0) {
      return { successCount: 0, failureCount: 0 };
    }

    const CHUNK_SIZE = 500;
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < targetUserIds.length; i += CHUNK_SIZE) {
      const chunk = targetUserIds.slice(i, i + CHUNK_SIZE);
      if (chunk.length === 0) continue;

      try {
        const res = await fetch("https://api.line.me/v2/bot/message/multicast", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            to: chunk,
            messages: [
              {
                type: "flex",
                altText,
                contents: flexBubble,
              },
            ],
          }),
        });

        if (res.ok) {
          successCount += chunk.length;
        } else {
          const errText = await res.text();
          console.error(`Multicast chunk failed: HTTP ${res.status} - ${errText}`);
          failureCount += chunk.length;
        }
      } catch (err) {
        console.error("Multicast request error:", err);
        failureCount += chunk.length;
      }
    }

    return { successCount, failureCount };
  }

  /**
   * Publish a new company announcement and multicast to all active company employees
   */
  async publishAnnouncement(
    companyId: string,
    payload: CreateAnnouncementPayload,
    tokenOverride?: string
  ): Promise<{ success: boolean; announcement: AnnouncementRecord; recipientsCount: number; error?: string }> {
    const title = (payload.title || "").trim();
    const content = (payload.content || "").trim();
    const authorName = (payload.authorName || "公司人事行政部").trim();

    if (!title || !content) {
      throw new Error("公告標題與內容皆為必填項目");
    }

    const id = `ann_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    await this.repo.createAnnouncement({
      id,
      companyId,
      title,
      content,
      authorName
    });

    const announcement: AnnouncementRecord = {
      id,
      company_id: companyId,
      title,
      content,
      author_name: authorName,
      created_at: new Date().toISOString().replace("T", " ").substring(0, 19)
    };

    // 1. Fetch all active employee LINE IDs for this company
    const targetUserIds = await this.repo.getCompanyEmployeeUserIds(companyId);

    // 2. Multicast to active employees
    const token = tokenOverride || this.env.LINE_CHANNEL_ACCESS_TOKEN || "";
    if (token && targetUserIds.length > 0) {
      const { flexBubble, altText } = buildAnnouncementFlexBubble(announcement, false);
      await this.dispatchMulticast(token, targetUserIds, flexBubble, altText);
    }

    return {
      success: true,
      announcement,
      recipientsCount: targetUserIds.length
    };
  }

  /**
   * Record read receipt when employee clicks acknowledgement postback button
   */
  async acknowledgeAnnouncement(
    announcementId: string,
    lineUserId: string
  ): Promise<{ success: boolean; isFirstTime: boolean; announcementTitle: string; readAt: string }> {
    return await this.repo.recordReadReceipt(announcementId, lineUserId);
  }

  /**
   * Remind unread employees via multicast
   */
  async remindUnreadEmployees(
    announcementId: string,
    companyId: string,
    tokenOverride?: string
  ): Promise<{ success: boolean; remindedCount: number; message: string }> {
    const announcement = await this.repo.getAnnouncementById(announcementId);
    if (!announcement) {
      throw new Error("查無此公告");
    }

    if (announcement.company_id !== companyId && !announcement.company_id.startsWith(`${companyId}-`)) {
      throw new Error("無權限存取此公告");
    }

    // 1. Query only unread employee LINE IDs
    const unreadUserIds = await this.repo.getUnreadEmployeeUserIds(announcementId, companyId);
    if (unreadUserIds.length === 0) {
      return {
        success: true,
        remindedCount: 0,
        message: "全體同仁皆已完成簽收，無需催簽。"
      };
    }

    // 2. Multicast reminder Flex message
    const token = tokenOverride || this.env.LINE_CHANNEL_ACCESS_TOKEN || "";
    if (token) {
      const { flexBubble, altText } = buildAnnouncementFlexBubble(announcement, true);
      await this.dispatchMulticast(token, unreadUserIds, flexBubble, altText);
    }

    return {
      success: true,
      remindedCount: unreadUserIds.length,
      message: `已成功向 ${unreadUserIds.length} 位尚未簽收的同仁發送催簽提醒通知。`
    };
  }

  /**
   * List announcements with reading statistics
   */
  async listAnnouncements(companyId: string): Promise<AnnouncementRecord[]> {
    return await this.repo.listAnnouncementsByCompany(companyId);
  }

  /**
   * Get detailed reading statistics and recipient lists
   */
  async getAnnouncementDetails(
    announcementId: string,
    companyId: string
  ): Promise<AnnouncementDetailResponse | null> {
    return await this.repo.getAnnouncementDetailsAndRecipients(announcementId, companyId);
  }
}
