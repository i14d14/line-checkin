import { renderLiffLayoutOpen, renderLiffMainClose, renderLiffLayoutClose } from "./liff-layout";
import { renderLiffTabs } from "./liff-tabs";
import { renderLiffModals } from "./liff-modals";
import { renderLiffScripts } from "./liff-scripts";

/**
 * LIFF Mobile Portal HTML Renderer (Assembler)
 * Assembles modular partials into a complete responsive Mobile LIFF UI.
 */
export function renderLiffHtml(liffId: string, defaultLocationName: string): string {
  const nowUtc = new Date();
  const twTime = new Date(nowUtc.getTime() + 8 * 3600 * 1000);
  const currentMonthStr = twTime.toISOString().slice(0, 7);

  return (
    renderLiffLayoutOpen() +
    renderLiffTabs(currentMonthStr) +
    renderLiffModals() +
    renderLiffMainClose() +
    renderLiffScripts(liffId) +
    renderLiffLayoutClose()
  );
}
