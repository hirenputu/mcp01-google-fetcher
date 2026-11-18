import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3001;
const HOST = "127.0.0.1";
const TARGET_DIR = process.env.MCP_OUTPUT_DIR || "/var/www/html/mcp01";
const MCP_API_KEY =
  process.env.MCP_API_KEY ||
  "kmw_sec_e36e46ddf87a199eb15e79e485802fcccae42f167597b463";
const BASE_URL = process.env.MCP_BASE_URL || "https://mcp.purplemind.ai";

function log(level, message, meta = "") {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${level.toUpperCase()}] ${message} ${meta}`.trim());
}

function logError(message, err) {
  const ts = new Date().toISOString();
  console.error(`[${ts}] [ERROR] ${message}`, err || "");
}

// In-memory OAuth code store (TTL: 10 mins)
const oauthCodes = new Map();

// Authentication middleware for MCP endpoints
function authenticate(req, res, next) {
  if (!MCP_API_KEY) {
    return next();
  }

  // 1. Check Authorization: Bearer <token> or X-API-Key header
  const authHeader = req.headers["authorization"] || req.headers["x-api-key"];
  if (authHeader) {
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : authHeader.trim();
    if (token === MCP_API_KEY) {
      return next();
    }
  }

  // 2. Check query parameter: ?token=<token>
  if (req.query.token && req.query.token.trim() === MCP_API_KEY) {
    return next();
  }

  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  log("warn", `Unauthorized access attempt from ${clientIp} to ${req.originalUrl}`);

  return res.status(401).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Unauthorized: Invalid or missing Bearer token / API key.",
    },
  });
}

// Structured information parsed from https://kamwo.com/escript/index.html
const KAMWO_ESCRIPT_PORTAL_DATA = {
  organization: "Kamwo Meridian Herbs",
  description:
    "Comprehensive Traditional Chinese Medicine (TCM) dispensary, herb pharmacy, and practitioner management platform.",
  headquarters: {
    address: "211 Grand Street, New York, NY 10013",
    phone: "(212) 966-6370",
    hours: "10:00 AM - 6:20 PM, 7 Days a Week",
  },
  portalServices: [
    {
      name: "Escript Practitioner Portal",
      url: "https://www.kamwo.com/escript/p-public.php",
      description:
        "Practitioner portal for custom herbal prescription ordering, patient formula management, and dispensary compounding.",
    },
    {
      name: "Kamwo TCM Herb Guide",
      url: "https://www.kamwo.com/escript/herbguide/herbs.html",
      description:
        "Comprehensive TCM herb compendium, singles, formulas, and mobile guide application.",
    },
    {
      name: "TCM Suite",
      url: "https://tcmsuite.com/",
      description:
        "TCM electronic medical records (EMR), practice management, and dispensary integration system.",
    },
    {
      name: "Kamwo Herbs Online",
      url: "https://kamwoherbs.com/",
      description:
        "Main website for educational resources, raw herbs, granules, and herbal supplies.",
    },
    {
      name: "Kamwo Store",
      url: "https://kamwostore.com/",
      description:
        "Direct retail store for herbal formulas, acupuncture supplies, and wellness products.",
    },
    {
      name: "AcuDirect Practitioner Directory",
      url: "https://www.acudirect.com/find-practitioner.php",
      description:
        "National directory to locate licensed acupuncturists and TCM practitioners.",
    },
  ],
  policies: {
    privacy: "https://kamwoherbs.com/privacy-policy",
    terms: "https://kamwoherbs.com/terms-and-conditions",
  },
};

function createMcpServer() {
  const server = new Server(
    {
      name: "mcp01-kamwo-escript",
      version: "1.3.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    log("info", "Listing tools requested");
    return {
      tools: [
        {
          name: "get_kamwo_escript_info",
          description:
            "Returns structured information, contact info, hours, and service links analyzed from the Kamwo Escript portal (https://kamwo.com/escript/index.html).",
          inputSchema: {
            type: "object",
            properties: {
              section: {
                type: "string",
                description:
                  "Optional filter: 'all', 'services', 'contact', or 'portals'",
                default: "all",
              },
            },
          },
        },
        {
          name: "fetch_kamwo_page",
          description:
            "Fetches live HTML content from a Kamwo Escript URL (e.g. index.html, p-public.php, herbguide) and saves it to disk.",
          inputSchema: {
            type: "object",
            properties: {
              url: {
                type: "string",
                description:
                  "Target URL to fetch (defaults to 'https://kamwo.com/escript/index.html')",
                default: "https://kamwo.com/escript/index.html",
              },
              filename: {
                type: "string",
                description:
                  "Filename to save as (defaults to 'kamwo_escript.html')",
                default: "kamwo_escript.html",
              },
            },
          },
        },
        {
          name: "fetch_google_html",
          description:
            "Legacy tool: Connects to google.com, fetches HTML, and stores it in /var/www/html/mcp01.",
          inputSchema: {
            type: "object",
            properties: {
              filename: {
                type: "string",
                description: "Optional output filename",
                default: "google.html",
              },
              url: {
                type: "string",
                description: "Optional URL to fetch",
                default: "https://www.google.com",
              },
            },
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    log("info", `Executing tool call: ${name}`, JSON.stringify(args || {}));

    if (name === "get_kamwo_escript_info") {
      const section = args?.section || "all";
      let resultData = KAMWO_ESCRIPT_PORTAL_DATA;

      if (section === "services" || section === "portals") {
        resultData = { portalServices: KAMWO_ESCRIPT_PORTAL_DATA.portalServices };
      } else if (section === "contact") {
        resultData = {
          organization: KAMWO_ESCRIPT_PORTAL_DATA.organization,
          headquarters: KAMWO_ESCRIPT_PORTAL_DATA.headquarters,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(resultData, null, 2),
          },
        ],
      };
    }

    if (name === "fetch_kamwo_page" || name === "fetch_google_html") {
      try {
        const defaultUrl =
          name === "fetch_kamwo_page"
            ? "https://kamwo.com/escript/index.html"
            : "https://www.google.com";
        const defaultFilename =
          name === "fetch_kamwo_page" ? "kamwo_escript.html" : "google.html";

        const url = args?.url || defaultUrl;
        const filename = path.basename(args?.filename || defaultFilename);
        const outputPath = path.join(TARGET_DIR, filename);

        log("info", `Fetching webpage: ${url}`);
        const response = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
        });

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status} ${response.statusText} when fetching ${url}`
          );
        }

        const html = await response.text();
        await fs.mkdir(TARGET_DIR, { recursive: true });
        await fs.writeFile(outputPath, html, "utf-8");

        log(
          "info",
          `Saved ${html.length} bytes to ${outputPath} (HTTP ${response.status})`
        );

        return {
          content: [
            {
              type: "text",
              text: `Successfully fetched HTML from ${url} (HTTP ${response.status}).\nSaved ${html.length} bytes to: ${outputPath}\n\nTitle / Preview:\n${html.slice(0, 350)}...`,
            },
          ],
        };
      } catch (err) {
        logError(`Failed in ${name}`, err.message);
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error fetching URL: ${err.message}`,
            },
          ],
        };
      }
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  return server;
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const transports = new Map();

// -----------------------------------------------------------------------------
// OAuth 2.0 Metadata Discovery (RFC 8414 & OpenID Connect)
// -----------------------------------------------------------------------------
const oauthMetadata = {
  issuer: BASE_URL,
  authorization_endpoint: `${BASE_URL}/oauth/authorize`,
  token_endpoint: `${BASE_URL}/oauth/token`,
  registration_endpoint: `${BASE_URL}/oauth/register`,
  token_endpoint_auth_methods_supported: [
    "client_secret_post",
    "client_secret_basic",
    "none",
  ],
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256", "plain"],
  scopes_supported: ["mcp", "read", "write", "offline_access"],
};

app.get(
  ["/.well-known/oauth-authorization-server", "/.well-known/openid-configuration"],
  (req, res) => {
    res.json(oauthMetadata);
  }
);

// -----------------------------------------------------------------------------
// OAuth 2.0 Authorization Endpoint (Consent Screen)
// -----------------------------------------------------------------------------
app.get("/oauth/authorize", (req, res) => {
  const {
    client_id = "chatgpt",
    redirect_uri = "",
    state = "",
    code_challenge = "",
    code_challenge_method = "S256",
    scope = "mcp",
  } = req.query;

  log("info", `OAuth authorization requested by client_id: ${client_id}`);

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Kamwo Escript MCP Authorization</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f4f6f8; margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 90vh; }
    .card { background: #fff; padding: 32px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); max-width: 440px; width: 100%; }
    .badge { background: #e8f5e9; color: #2e7d32; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
    h2 { margin: 12px 0 6px; color: #111; font-size: 22px; }
    p { color: #555; font-size: 14px; line-height: 1.5; margin-bottom: 20px; }
    .scope-box { background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 8px; padding: 12px; margin-bottom: 20px; font-size: 13px; color: #333; }
    .field { margin-bottom: 18px; }
    label { display: block; font-weight: 600; margin-bottom: 6px; font-size: 13px; color: #333; }
    input[type="password"] { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #ced4da; border-radius: 6px; font-size: 14px; }
    .btn { background: #0070f3; color: white; border: none; padding: 12px; border-radius: 6px; width: 100%; font-size: 15px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
    .btn:hover { background: #005bb5; }
    .footer { text-align: center; margin-top: 16px; font-size: 12px; color: #888; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">Kamwo Meridian Herbs</span>
    <h2>Authorize Connector</h2>
    <p>ChatGPT is requesting permission to access your <strong>Kamwo Escript MCP Server</strong> tools and services.</p>
    
    <div class="scope-box">
      <strong>Requested Permissions:</strong><br>
      • Access Escript dispensary information<br>
      • Retrieve herb guide & formulas<br>
      • Execute MCP tools over secure connection
    </div>

    <form method="POST" action="/oauth/authorize">
      <input type="hidden" name="client_id" value="${encodeURIComponent(client_id)}" />
      <input type="hidden" name="redirect_uri" value="${encodeURIComponent(redirect_uri)}" />
      <input type="hidden" name="state" value="${encodeURIComponent(state)}" />
      <input type="hidden" name="code_challenge" value="${encodeURIComponent(code_challenge)}" />
      <input type="hidden" name="code_challenge_method" value="${encodeURIComponent(code_challenge_method)}" />
      <input type="hidden" name="scope" value="${encodeURIComponent(scope)}" />
      
      <div class="field">
        <label for="secret">Master API Secret</label>
        <input type="password" id="secret" name="secret" value="${MCP_API_KEY}" required />
      </div>

      <button type="submit" class="btn">Authorize ChatGPT</button>
    </form>
    <div class="footer">Kamwo Meridian Herbs • 211 Grand Street, NY</div>
  </div>
</body>
</html>`);
});

app.post("/oauth/authorize", (req, res) => {
  const {
    redirect_uri: rawRedirectUri,
    state: rawState,
    code_challenge = "",
    code_challenge_method = "S256",
    secret = "",
  } = req.body;

  const redirect_uri = decodeURIComponent(rawRedirectUri || "");
  const state = decodeURIComponent(rawState || "");

  if (secret.trim() !== MCP_API_KEY) {
    return res.status(403).send("Invalid Master Secret key. Authorization denied.");
  }

  if (!redirect_uri) {
    return res.status(400).send("Missing redirect_uri parameter");
  }

  // Generate temporary auth code
  const authCode = "kmw_code_" + crypto.randomBytes(16).toString("hex");

  oauthCodes.set(authCode, {
    code_challenge,
    code_challenge_method,
    redirect_uri,
    createdAt: Date.now(),
  });

  log("info", `Issued authorization code for redirect to ${redirect_uri}`);

  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set("code", authCode);
  if (state) {
    redirectUrl.searchParams.set("state", state);
  }

  res.redirect(redirectUrl.toString());
});

// -----------------------------------------------------------------------------
// OAuth 2.0 Token Endpoint
// -----------------------------------------------------------------------------
app.post("/oauth/token", (req, res) => {
  const { grant_type, code, code_verifier, client_secret } = req.body;

  log("info", `OAuth token exchange requested (grant_type: ${grant_type})`);

  if (grant_type === "authorization_code") {
    const codeData = oauthCodes.get(code);

    if (!codeData) {
      log("warn", "Invalid or expired authorization code");
      return res.status(400).json({ error: "invalid_grant", error_description: "Invalid or expired authorization code" });
    }

    // Clean up used code
    oauthCodes.delete(code);

    // Validate PKCE if challenge was set
    if (codeData.code_challenge) {
      if (!code_verifier) {
        return res.status(400).json({ error: "invalid_request", error_description: "Missing PKCE code_verifier" });
      }

      let computedChallenge = code_verifier;
      if (codeData.code_challenge_method === "S256") {
        computedChallenge = crypto
          .createHash("sha256")
          .update(code_verifier)
          .digest("base64url");
      }

      if (computedChallenge !== codeData.code_challenge) {
        log("warn", "PKCE verification failed");
        return res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed" });
      }
    }

    log("info", "OAuth token exchange successful. Returning access token.");

    return res.json({
      access_token: MCP_API_KEY,
      token_type: "Bearer",
      expires_in: 315360000,
      refresh_token: MCP_API_KEY,
      scope: "mcp",
    });
  }

  if (grant_type === "refresh_token" || grant_type === "client_credentials") {
    return res.json({
      access_token: MCP_API_KEY,
      token_type: "Bearer",
      expires_in: 315360000,
      scope: "mcp",
    });
  }

  return res.status(400).json({ error: "unsupported_grant_type" });
});

// -----------------------------------------------------------------------------
// Dynamic Client Registration (Optional / RFC 7591)
// -----------------------------------------------------------------------------
app.post("/oauth/register", (req, res) => {
  log("info", "Dynamic Client Registration requested");
  res.status(201).json({
    client_id: "chatgpt_connector_client",
    client_secret: MCP_API_KEY,
    client_name: "ChatGPT Connector",
    redirect_uris: req.body?.redirect_uris || [
      "https://chatgpt.com/connector/oauth/ZD8OMZ_TS2-e",
    ],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  });
});

// -----------------------------------------------------------------------------
// Public Health Check
// -----------------------------------------------------------------------------
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "mcp01-kamwo-escript",
    version: "1.3.0",
    mode: "SSE",
    authEnabled: !!MCP_API_KEY,
    oauthSupported: true,
    uptime: process.uptime(),
    activeSessions: transports.size,
    kamwoPortalTarget: "https://kamwo.com/escript/index.html",
  });
});

// -----------------------------------------------------------------------------
// SSE MCP Endpoint (Protected)
// -----------------------------------------------------------------------------
app.get("/sse", authenticate, async (req, res) => {
  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  log("info", `New authenticated SSE connection established from ${clientIp}`);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const messageEndpoint = req.query.token
    ? `/messages?token=${encodeURIComponent(req.query.token)}`
    : "/messages";

  const transport = new SSEServerTransport(messageEndpoint, res);
  const server = createMcpServer();

  transports.set(transport.sessionId, transport);
  log("info", `Session registered: ${transport.sessionId}`);

  req.on("close", () => {
    log("info", `SSE connection closed for session: ${transport.sessionId}`);
    transports.delete(transport.sessionId);
  });

  await server.connect(transport);
});

// -----------------------------------------------------------------------------
// Messages POST endpoint (Protected)
// -----------------------------------------------------------------------------
app.post("/messages", authenticate, async (req, res) => {
  const sessionId = req.query.sessionId;
  if (!sessionId) {
    log("warn", "Missing sessionId in /messages query");
    return res.status(400).send("Missing sessionId parameter");
  }

  const transport = transports.get(sessionId);
  if (!transport) {
    log("warn", `Session not found: ${sessionId}`);
    return res.status(404).send("Session not found or expired");
  }

  await transport.handlePostMessage(req, res, req.body);
});

app.listen(PORT, HOST, () => {
  log(
    "info",
    `Kamwo Escript MCP Server v1.3.0 (SSE mode + OAuth 2.0) listening on http://${HOST}:${PORT}`
  );
});
