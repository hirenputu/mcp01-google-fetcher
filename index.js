#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_TARGET_DIR = "C:\\Users\\hiren\\Documents\\mcpserver\\mcp01";
const TARGET_DIR = process.env.MCP_OUTPUT_DIR || DEFAULT_TARGET_DIR;

// Structured data analyzed from https://kamwo.com/escript/index.html
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

// Register list of tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
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
          "Legacy tool: Connects to google.com, fetches HTML source, and stores it in output directory.",
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

// Register tool execution handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

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

      let targetDir = TARGET_DIR;
      try {
        await fs.mkdir(targetDir, { recursive: true });
      } catch {
        targetDir = process.cwd();
      }
      const outputPath = path.join(targetDir, filename);

      console.error(`[mcp01] Fetching URL: ${url}...`);

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
          `Failed to fetch ${url}: HTTP ${response.status} ${response.statusText}`
        );
      }

      const htmlContent = await response.text();
      await fs.writeFile(outputPath, htmlContent, "utf-8");

      console.error(
        `[mcp01] Successfully saved ${htmlContent.length} bytes to ${outputPath}`
      );

      return {
        content: [
          {
            type: "text",
            text: `Successfully fetched HTML from ${url} (HTTP ${response.status}).\nSaved ${htmlContent.length} bytes to:\n${outputPath}\n\nTitle / Preview:\n${htmlContent.slice(0, 350)}...`,
          },
        ],
      };
    } catch (err) {
      console.error(`[mcp01] Error during tool call:`, err);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Failed to fetch webpage: ${err.message}`,
          },
        ],
      };
    }
  }

  throw new Error(`Tool not found: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp01] Kamwo Escript MCP Server running on stdio");
}

main().catch((err) => {
  console.error("[mcp01] Fatal error in main():", err);
  process.exit(1);
});
