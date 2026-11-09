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

const server = new Server(
  {
    name: "mcp01-google-fetcher",
    version: "1.0.0",
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
        name: "fetch_google_html",
        description:
          "Connects to google.com, fetches the HTML source of the page, and stores it in C:\\Users\\hiren\\Documents\\mcpserver\\mcp01",
        inputSchema: {
          type: "object",
          properties: {
            filename: {
              type: "string",
              description:
                "Optional output filename (defaults to 'google.html')",
              default: "google.html",
            },
            url: {
              type: "string",
              description:
                "Optional URL to fetch (defaults to 'https://www.google.com')",
              default: "https://www.google.com",
            },
          },
        },
      },
    ],
  };
});

// Helper function to fetch and save HTML
async function fetchAndSaveGoogleHtml(targetUrl = "https://www.google.com", filename = "google.html") {
  const safeFilename = path.basename(filename) || "google.html";
  
  let targetDir = TARGET_DIR;
  try {
    await fs.mkdir(targetDir, { recursive: true });
  } catch {
    targetDir = process.cwd();
  }
  const outputPath = path.join(targetDir, safeFilename);

  console.error(`[mcp01] Fetching URL: ${targetUrl}...`);

  const response = await fetch(targetUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${targetUrl}: HTTP ${response.status} ${response.statusText}`
    );
  }

  const htmlContent = await response.text();
  await fs.writeFile(outputPath, htmlContent, "utf-8");

  console.error(
    `[mcp01] Successfully saved ${htmlContent.length} bytes to ${outputPath}`
  );

  return {
    filePath: outputPath,
    bytes: htmlContent.length,
    status: response.status,
    preview: htmlContent.slice(0, 300),
  };
}

// Register tool execution handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "fetch_google_html") {
    try {
      const url = args?.url || "https://www.google.com";
      const filename = args?.filename || "google.html";

      const result = await fetchAndSaveGoogleHtml(url, filename);

      return {
        content: [
          {
            type: "text",
            text: `Successfully fetched HTML from ${url} (HTTP ${result.status}).\nSaved ${result.bytes} bytes to:\n${result.filePath}\n\nPreview:\n${result.preview}...`,
          },
        ],
      };
    } catch (err) {
      console.error(`[mcp01] Error during fetch_google_html:`, err);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Failed to fetch and save HTML: ${err.message}`,
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
  console.error("[mcp01] Google Fetcher MCP Server running on stdio");
}

main().catch((err) => {
  console.error("[mcp01] Fatal error in main():", err);
  process.exit(1);
});
