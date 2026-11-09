# MCP01: Google HTML Fetcher MCP Server

A Model Context Protocol (MCP) server that connects to `google.com`, retrieves the page's HTML source, and stores it in your local directory.

---

## Features

- **Standard MCP Protocol**: Communicates using JSON-RPC 2.0 over standard I/O (`stdio`).
- **Webpage Fetching**: Connects to `google.com` (or user-defined target URL) with HTTP status inspection.
- **Local Persistence**: Writes the HTML response directly to a designated local path (defaults to `C:\Users\hiren\Documents\mcpserver\mcp01\google.html`).
- **Cloud-Ready / NPM Executable**: Can be installed or run on-demand directly from GitHub via `npx` or `npm`.

---

## Exposed MCP Tools

### `fetch_google_html`
Fetches HTML source from `google.com` and writes the resulting content to disk.

#### Input Schema
| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `url` | string | No | `https://www.google.com` | Target URL to fetch |
| `filename` | string | No | `google.html` | Destination filename |

---

## Installation & Usage

### Option 1: Run & Add Directly in Antigravity CLI (`agy`) via GitHub

You can register this MCP server in `agy` directly from GitHub using `npx`:

```bash
agy mcp add mcp01 npx -y github:hirenputu/mcp01-google-fetcher
```

Check status anytime:
```bash
agy mcp list
```

### Option 2: Run via NPM from GitHub

Run on-demand:
```bash
npx -y github:hirenputu/mcp01-google-fetcher
```

Or install globally:
```bash
npm install -g github:hirenputu/mcp01-google-fetcher
mcp01
```

### Option 3: Local Development
Clone this repository and run locally:
```bash
npm install
node index.js
```

---

## Environment Configuration

| Variable | Description | Default |
|---|---|---|
| `MCP_OUTPUT_DIR` | Directory where HTML files will be saved | `C:\Users\hiren\Documents\mcpserver\mcp01` |

---

## Permissions & Security

- **Strict Access Control**: No personal credentials, tokens, or private secrets are tracked in this repository.
- **Security Policy**: For reporting vulnerabilities, consult [SECURITY.md](SECURITY.md).
- **Network Boundaries**: Only outbound HTTP GET requests are performed.

---

## License

This project is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE) - see the [LICENSE](LICENSE) file for details.
