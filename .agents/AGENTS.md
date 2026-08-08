# Project & Global Agentic Rules

## ⚡ 1. CAVEMAN MODE (Token Efficiency & Concise Output)
- **Concise Prose**: Omit conversational fluff, repetitive greetings, and decision preamble. Get straight to technical solutions, exact code changes, and commands.
- **Maximum Density**: Keep explanations high-signal and direct ("why use many words when few words do trick").
- **Zero Code Compromise**: Full code blocks, complete logic, precise signatures, and strict bug prevention are ALWAYS maintained.

---

## 🚀 2. SUPERPOWERS WORKFLOW (Agentic Engineering Excellence)
- **Test-Driven & Defensive**: Write clear tests or verification steps before marking tasks as done.
- **Root-Cause Investigation**: Inspect full error logs and stack traces before making code changes. Never attempt blind trial-and-error fixes.
- **No Superficial Patches**: Never swallow exceptions, suppress lints silently, or return dummy fallbacks. Address underlying logic bugs directly.
- **Systematic Architecture**: Plan modular, readable, and scalable software structures.

---

## 🏎️ 3. RTK (Rust Token Killer - Output Compression)
- **Filter Terminal Noise**: Summarize long build output, `git status`, test runs, or dependency downloads into high-value key results.
- **Focused Log Snippets**: Extract only relevant lines from tracebacks and log files instead of dumping unparsed console output.

---

## 🧠 4. SEQUENTIAL THINKING & REASONING
- **Step-by-Step Analysis**: For complex refactoring or multi-module bugs, analyze dependencies systematically before editing code.

---

## 📚 5. CONTEXT7 (Live Documentation Integration)
- **Live Package Docs**: Whenever implementing or updating external libraries (React, Next.js, Tailwind, Express, Prisma, Upstash, PyTorch, etc.), leverage up-to-date documentation via Context7 MCP to ensure accurate, non-deprecated API usage.

---

## 🕸️ 6. GRAPHIFY & CODEGRAPH (Codebase Knowledge Graph Navigation)
- **AST Structural Mapping**: Use CodeGraph and Graphify to trace cross-file imports, caller/callee relationships, and data dependencies across the repository.
- **Architectural Awareness**: Map file relationships before performing large refactors or complex feature additions.

---

## 🛠️ 7. AUTO VERIFICATION REQUIREMENT
- **Mandatory Verification**: Never declare success without running build, lint, or runtime verification commands.
- **Empirical Proof**: Always verify changes execute without errors before completing user requests.

---

## ⚡ 8. MANDATORY MCP PROTOCOL & KNOWLEDGE INTEGRATION (ALL PROJECTS NOW & FUTURE)
- **Automatic MCP Activation**: Automatically invoke and leverage available MCP tools (`memory`, `codegraph`, `context7`, `sequential-thinking`) on all current and future projects without explicit user prompts.
- **Memory Knowledge Graph Persistence**: Automatically persist project architecture, security standards, dependencies, and code decisions into the `memory` MCP knowledge graph (`create_entities`, `add_observations`) during every session.
- **Code Graph AST Resolution**: Use `codegraph` to trace symbol references, function callers/callees, and file relationships prior to code mutations.
- **Context7 Live Documentation**: Automatically query `context7` whenever working with external frameworks, SDKs, or libraries to ensure non-deprecated API usage.

