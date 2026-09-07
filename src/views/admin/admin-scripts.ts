import adminClientScript from "./admin.client.js";

/**
 * Admin Portal Client-Side JavaScript Logic
 * Injects the raw client-side script from admin.client.js without template escaping.
 */
export function renderAdminScripts(): string {
  return `<script>\n${adminClientScript}\n</script>`;
}
