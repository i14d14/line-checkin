import liffClientScript from "./liff.client.js";

/**
 * LIFF Mobile Portal Client-Side JavaScript Logic
 * Injects the bundled client-side script from liff.client.js without template escaping.
 */
export function renderLiffScripts(liffId: string): string {
  return `
  <script>window.__LIFF_ID__ = "${liffId}";</script>
  <script>
${liffClientScript}
  </script>`;
}
