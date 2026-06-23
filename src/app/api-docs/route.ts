export const dynamic = "force-dynamic";

/**
 * Swagger UI for the OrderDesk API, served at /api-docs (protected — requires a
 * signed-in session in Clerk mode). Loads the spec from /api-docs/openapi and
 * uses Swagger UI from the CDN. Use "Authorize" → X-API-Key to test /api/v1/me.
 */
const HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OrderDesk API — Swagger UI</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>body{margin:0;background:#fafafa}.topbar{display:none}</style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js" crossorigin></script>
    <script>
      window.onload = () => {
        window.ui = SwaggerUIBundle({
          url: "/api-docs/openapi",
          dom_id: "#swagger-ui",
          deepLinking: true,
          presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
          layout: "StandaloneLayout",
          persistAuthorization: true,
          tryItOutEnabled: true,
        });
      };
    </script>
  </body>
</html>`;

// Relaxed CSP for this page only — allows Swagger UI assets from the unpkg CDN.
// The strict app-wide CSP (next.config.ts) excludes /api-docs.
const DOCS_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com",
  "style-src 'self' 'unsafe-inline' https://unpkg.com",
  "img-src 'self' data: https://unpkg.com",
  "font-src 'self' data: https://unpkg.com",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
].join("; ");

export async function GET() {
  return new Response(HTML, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": DOCS_CSP,
    },
  });
}
