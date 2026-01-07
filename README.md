# PolyLadder

Cloud-hosted web application for parallel language learning.

## Overview

PolyLadder is a language learning platform that enables users to study multiple languages simultaneously using a comparative approach. The system features a continuously growing linguistic knowledge base, structured curriculum with grammar lessons, vocabulary tracking, and cross-language translation exercises.

## Supported Languages

| Language   | Code | Standard |
| ---------- | ---- | -------- |
| English    | EN   | US       |
| Italian    | IT   | Standard |
| Portuguese | PT   | Portugal |
| Slovenian  | SL   | Standard |
| Spanish    | ES   | Spain    |

## Technology Stack

| Component       | Technology                |
| --------------- | ------------------------- |
| Runtime         | Node.js 20.x              |
| Language        | TypeScript 5.x            |
| Database        | PostgreSQL 15.x           |
| API             | Fastify                   |
| Frontend        | React, Vite, Tailwind CSS |
| Package Manager | pnpm                      |

## Project Structure

```
polyladder/
├── packages/
│   ├── api/                  # REST API server
│   └── web/                  # React frontend
└── .github/                  # CI/CD workflows
```

## Development

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 8.0.0
- Access to PolyLadderCommon repository

### Setup

```bash
# Clone repositories into same parent directory
git clone https://github.com/arina-fedorova/PolyLadder.git
git clone <private>/PolyLadderCommon.git

# Install dependencies
cd PolyLadder
pnpm install

# Start development servers
pnpm dev
```

### Scripts

```bash
pnpm build      # Build all packages
pnpm test       # Run all tests
pnpm lint       # Lint all packages
pnpm format     # Format code with Prettier
```

## Documentation

Full documentation is maintained in [PolyLadderCommon](../PolyLadderCommon/docs/):

- [Technical Specification](../PolyLadderCommon/docs/polyladder/TECHNICAL_SPECIFICATION.md)
- [System Architecture](../PolyLadderCommon/docs/architecture/SEPARATION_PLAN.md)
- [Documentation Index](../PolyLadderCommon/docs/README.md)

## Related Projects

| Project                    | Description                   | Repository                                                             |
| -------------------------- | ----------------------------- | ---------------------------------------------------------------------- |
| PolyLadderCommon           | Shared code and documentation | Private                                                                |
| PolyLadderAdmin            | Operator dashboard            | Private                                                                |
| MultilingualVoiceAssistant | Voice-based tutor             | [GitHub](https://github.com/arina-fedorova/MultilingualVoiceAssistant) |
