import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3001;
const HOST = "127.0.0.1";
const TARGET_DIR = process.env.MCP_OUTPUT_DIR || "/var/www/html/mcp01";

function log(level, message, meta = "") {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${level.toUpperCase()}] ${message} ${meta}`.trim());
}

function logError(message, err) {
  const ts = new Date().toISOString();
  console.error(`[${ts}] [ERROR] ${message}`, err || "");
}

// Structured information parsed from https://kamwo.com/escript/index.html
const KAMWO_ESCRIPT_PORTAL_DATA = {
  organization: "Kamwo Meridian Herbs",
  description: "Comprehensive Traditional Chinese Medicine (TCM) dispensary, herb pharmacy, and practitioner management platform.",
  headquarters: {
    address: "211 Grand Street, New York, NY 10013",
    phone: "(212) 966-6370",
    hours: "10:00 AM - 6:20 PM, 7 Days a Week"
  },
  portalServices: [
    {
      name: "Escript Practitioner Portal",
      url: "https://www.kamwo.com/escript/p-public.php",
      description: "Practitioner portal for custom herbal prescription ordering, patient formula management, and dispensary compounding."
    },
    {
      name: "Kamwo TCM Herb Guide",
      url: "https://www.kamwo.com/escript/herbguide/herbs.html",
      description: "Comprehensive TCM herb compendium, singles, formulas, and mobile guide application."
    },
    {
      name: "TCM Suite",
      url: "https://tcmsuite.com/",
      description: "TCM electronic medical records (EMR), practice management, and dispensary integration system."
    },
    {
      name: "Kamwo Herbs Online",
      url: "https://kamwoherbs.com/",
      description: "Main website for educational resources, raw herbs, granules, and herbal supplies."
    },
    {
      name: "Kamwo Store",
      url: "https://kamwostore.com/",
      description: "Direct retail store for herbal formulas, acupuncture supplies, and wellness products."
    },
    {
      name: "AcuDirect Practitioner Directory",
      url: "https://www.acudirect.com/find-practitioner.php",
      description: "National directory to locate licensed acupuncturists and TCM practitioners."
    }
  ],
  policies: {
    privacy: "https://kamwoherbs.com/privacy-policy",
    terms: "https://kamwoherbs.com/terms-and-conditions"
  }
};

// Function to create a configured MCP Server instance per session
function createMcpServer() {
  const server = new Server(
    {
      name: "mcp01-kamwo-escript",
      version: "1.1.0",
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

const transports = new Map();

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "mcp01-kamwo-escript",
    version: "1.1.0",
    mode: "SSE",
    uptime: process.uptime(),
    activeSessions: transports.size,
    kamwoPortalTarget: "https://kamwo.com/escript/index.html",
  });
});

// SSE endpoint
app.get("/sse", async (req, res) => {
  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  log("info", `New SSE connection established from ${clientIp}`);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const transport = new SSEServerTransport("/messages", res);
  const server = createMcpServer();

  transports.set(transport.sessionId, transport);
  log("info", `Session registered: ${transport.sessionId}`);

  req.on("close", () => {
    log("info", `SSE connection closed for session: ${transport.sessionId}`);
    transports.delete(transport.sessionId);
  });

  await server.connect(transport);
});

// Messages POST endpoint
app.post("/messages", async (req, res) => {
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
    `Kamwo Escript MCP Server (SSE mode) listening on http://${HOST}:${PORT} | Output DIR: ${TARGET_DIR}`
  );
});
