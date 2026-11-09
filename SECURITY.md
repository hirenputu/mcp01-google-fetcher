# Security Policy

## Supported Versions

Only the latest release / default branch (`main`) is actively monitored for security vulnerabilities.

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

---

## Security & Access Control Guidelines

This repository hosts a Model Context Protocol (MCP) server designed to fetch webpage contents and save them to a specified local directory.

### 1. Token & Credential Protection
* **Zero Hardcoded Secrets**: This project never stores, transmits, or expects API keys, passwords, or personal access tokens in source control.
* **Environment Security**: Any sensitive configuration must only be passed through local environment variables and never checked into Git.
* **Ignored Files**: All token files, credentials (`*.pem`, `*.key`), and local outputs are explicitly excluded via `.gitignore`.

### 2. Network & File Access Boundaries
* The server communicates over standard input/output (`stdio`) locally.
* File writing is restricted to designated local output paths (`process.env.MCP_OUTPUT_DIR` or the configured local directory).
* Network connections are initiated outward only to fetch designated public web endpoints.

---

## Reporting a Vulnerability

If you discover a security vulnerability or sensitive data exposure within this repository:

1. **Do not create a public issue.**
2. Send an email or private message via GitHub to the repository owner ([@hirenputu](https://github.com/hirenputu)).
3. Include details of the vulnerability, reproduction steps, and potential impact.
4. Vulnerability reports will be investigated and addressed promptly.
