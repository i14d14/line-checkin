/**
 * Ambient Module Declarations for Client Asset Files
 * Allows importing client scripts as raw string content via Wrangler Text loader.
 */
declare module "*.client.js" {
  const content: string;
  export default content;
}
