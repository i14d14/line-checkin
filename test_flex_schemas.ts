import { assertValidFlexBubble, assertValidFlexMessage, FlexValidationError } from "./src/utils/flex-validator";
import { buildCheckinReceiptBubble, buildCheckinFlexMessage } from "./src/views/flex/checkin-flex";
import { buildApprovalRequestFlex, buildApprovalResultFlex } from "./src/views/flex/approval-flex";
import { buildAnnouncementFlexBubble } from "./src/views/flex/announcement-flex";
import { buildPayslipFlexBubble } from "./src/views/flex/payslip-flex";
import { buildReminderFlexBubble } from "./src/views/flex/reminder-flex";

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error("Assertion Failed: " + msg);
}

async function runFlexSchemaTests() {
  console.log("=== Running LINE Messaging API v3 Flex Schema Protocol Gate Tests ===");

  // 1. Test Checkin Flex Messages (IN, OUT, DUPLICATE, IP_WHITELIST, GPS_FALLBACK)
  console.log("\n[1] Testing Check-in Flex Messages...");
  const inBubble = buildCheckinReceiptBubble({
    userName: "王小明",
    timeStr: "2026-09-08 08:55",
    distanceMeters: 12,
    locationName: "台中美德總部",
    address: "台中市北區美德街56-11號",
    punchType: "IN",
    verifyMode: "IP_WHITELIST",
    recordId: 101,
  });
  const validatedInBubble = assertValidFlexBubble(inBubble);
  assert(validatedInBubble.type === "bubble", "Checkin IN bubble type must be bubble");
  console.log("  ✅ PASS: Checkin IN bubble complies with LINE Flex specification");

  const outMessage = buildCheckinFlexMessage({
    userName: "王小明",
    timeStr: "2026-09-08 18:05",
    distanceMeters: 45,
    locationName: "台中美德總部",
    address: "台中市北區美德街56-11號",
    punchType: "OUT",
    workHours: 9.1,
    verifyMode: "GPS_FALLBACK",
    recordId: 102,
  });
  const validatedOutMessage = assertValidFlexMessage(outMessage);
  assert(validatedOutMessage.type === "flex", "Checkin flex message type must be flex");
  assert(validatedOutMessage.altText.length > 0, "Checkin altText must not be empty");
  console.log("  ✅ PASS: Checkin OUT flex message complies with LINE Flex specification");

  // 2. Test Approval Request & Result Flex (LEAVE, CORRECTION, OVERTIME)
  console.log("\n[2] Testing BPM Approval Flex Messages...");
  const leaveFlex = buildApprovalRequestFlex(
    "APPR-20260908-001",
    "LEAVE",
    "陳大文",
    "台中美德總部",
    "2026-09-09",
    { leave_type: "特休", time_range: "09:00 - 18:00", reason: "家庭旅遊", attachment_url: "https://example.com/receipt.jpg" }
  );
  assertValidFlexBubble(leaveFlex.flexBubble);
  assertValidFlexMessage({ type: "flex", altText: leaveFlex.altText, contents: leaveFlex.flexBubble });
  console.log("  ✅ PASS: Leave approval request with attachment complies with LINE Flex specification");

  const correctionFlex = buildApprovalRequestFlex(
    "APPR-20260908-002",
    "CORRECTION",
    "陳大文",
    "台中美德總部",
    "2026-09-08",
    { punch_type: "IN", time: "09:00", work_hours: 8, reason: "公務外出忘記打卡" }
  );
  assertValidFlexBubble(correctionFlex.flexBubble);
  console.log("  ✅ PASS: Correction approval request complies with LINE Flex specification");

  const approvedResult = buildApprovalResultFlex(
    "陳大文",
    "LEAVE",
    "2026-09-09",
    "APPROVED"
  );
  assertValidFlexBubble(approvedResult.flexBubble);
  console.log("  ✅ PASS: Approved result card complies with LINE Flex specification");

  const rejectedResult = buildApprovalResultFlex(
    "陳大文",
    "CORRECTION",
    "2026-09-08",
    "REJECTED",
    "出勤異常紀錄與門市即時定位不符，請重新確認時間。"
  );
  assertValidFlexBubble(rejectedResult.flexBubble);
  console.log("  ✅ PASS: Rejected result card with custom reason complies with LINE Flex specification");

  // 3. Test Announcement Flex Messages
  console.log("\n[3] Testing Announcement Flex Messages...");
  const announcementResult = buildAnnouncementFlexBubble({
    id: "ANN-2026-01",
    title: "2026 中秋連假營運與出勤注意事項通知",
    content: "全體同仁請注意，中秋連假期間出勤依勞基法規定核發加班費...",
    author_name: "人事總務部",
    created_at: "2026-09-08 10:00",
  }, false);
  assertValidFlexBubble(announcementResult.flexBubble);
  assertValidFlexMessage({ type: "flex", altText: announcementResult.altText, contents: announcementResult.flexBubble });
  console.log("  ✅ PASS: Announcement bubble complies with LINE Flex specification");

  // 4. Test Payslip Flex Messages
  console.log("\n[4] Testing E-Payslip Flex Messages...");
  const payslipResult = buildPayslipFlexBubble({
    employee_id: "EMP001",
    employee_name: "林小華",
    pay_month: "2026-08",
    base_salary: 42000,
    allowances: 3000,
    overtime_pay: 2500,
    deductions: 2800,
    net_salary: 44700,
    note: "本月考勤全勤獎金已併入津貼計算",
  });
  assertValidFlexBubble(payslipResult.flexBubble);
  assertValidFlexMessage({ type: "flex", altText: payslipResult.altText, contents: payslipResult.flexBubble });
  console.log("  ✅ PASS: E-Payslip bubble complies with LINE Flex specification");

  // 5. Test Reminder Flex Messages
  console.log("\n[5] Testing Reminder Flex Messages...");
  const reminderResult = buildReminderFlexBubble("IN", {
    shiftTime: "09:00",
    userName: "黃大維",
    locationName: "台中美德總部",
    diffMinutes: 15,
  });
  assertValidFlexBubble(reminderResult.flexBubble);
  assertValidFlexMessage({ type: "flex", altText: reminderResult.altText, contents: reminderResult.flexBubble });
  console.log("  ✅ PASS: Scheduled reminder bubble complies with LINE Flex specification");

  // 6. NEGATIVE TESTS: Enforce rejection of illegal properties
  console.log("\n[6] Running NEGATIVE Security & Protocol Violation Tests...");

  // 6a. Inject illegal inputOption on postback action (e.g. historical bug "openKeyboardWithMessage")
  let caughtIllegalInputOption = false;
  try {
    const corruptedBubble = JSON.parse(JSON.stringify(leaveFlex.flexBubble));
    // Find the postback button and inject invalid property
    const rejectBtn = corruptedBubble.footer.contents[0].contents[1];
    rejectBtn.action.inputOption = "openKeyboardWithMessage"; // Illegal!
    assertValidFlexBubble(corruptedBubble);
  } catch (err: any) {
    if (err instanceof FlexValidationError) {
      caughtIllegalInputOption = true;
      console.log("    [Captured issues]:", err.issues);
      assert(err.issues.some((i: string) => i.includes("inputOption") || i.includes("footer")), "Must identify inputOption or footer as invalid");
      console.log("  ✅ PASS: Successfully rejected illegal inputOption: 'openKeyboardWithMessage'");
    } else {
      throw err;
    }
  }
  assert(caughtIllegalInputOption, "FAIL: Validator failed to catch illegal inputOption!");

  // 6b. Empty altText in Flex Message
  let caughtEmptyAltText = false;
  try {
    assertValidFlexMessage({
      type: "flex",
      altText: "", // Illegal: empty altText
      contents: leaveFlex.flexBubble,
    });
  } catch (err: any) {
    if (err instanceof FlexValidationError) {
      caughtEmptyAltText = true;
      console.log("  ✅ PASS: Successfully rejected empty altText");
    } else {
      throw err;
    }
  }
  assert(caughtEmptyAltText, "FAIL: Validator failed to catch empty altText!");

  // 6c. Invalid component type
  let caughtInvalidComponent = false;
  try {
    const corruptedBubble = JSON.parse(JSON.stringify(leaveFlex.flexBubble));
    corruptedBubble.body.contents.push({ type: "unknown_widget", data: 123 });
    assertValidFlexBubble(corruptedBubble);
  } catch (err: any) {
    if (err instanceof FlexValidationError) {
      caughtInvalidComponent = true;
      console.log("  ✅ PASS: Successfully rejected unknown component type");
    } else {
      throw err;
    }
  }
  assert(caughtInvalidComponent, "FAIL: Validator failed to catch invalid component type!");

  console.log("\n🎉 ALL 10 LINE FLEX SCHEMA PROTOCOL TESTS (POSITIVE & NEGATIVE) PASSED 100%!");
}

runFlexSchemaTests().catch((err) => {
  console.error("\n❌ TEST SUITE FAILED:", err);
  process.exit(1);
});
