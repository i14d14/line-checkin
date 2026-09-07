import { renderAdminLayoutOpen, renderAdminMainClose, renderAdminLayoutClose } from "./admin-layout";
import { renderAdminTabs } from "./admin-tabs";
import { renderAdminModals } from "./admin-modals";
import { renderAdminScripts } from "./admin-scripts";

/**
 * Client Local Management Portal HTML Renderer (Assembler)
 * Assembles modular partials into a complete responsive Single-Page Admin UI.
 */
export function renderLocalAdminHtml(): string {
  return (
    renderAdminLayoutOpen() +
    renderAdminTabs() +
    renderAdminMainClose() +
    renderAdminModals() +
    renderAdminScripts() +
    renderAdminLayoutClose()
  );
}
