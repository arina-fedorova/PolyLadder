# PolyLadder

Cloud-hosted web application for parallel language learning.

## Overview

PolyLadder is a language learning platform that enables users to study multiple languages simultaneously using a comparative approach. The system features a continuously growing linguistic knowledge base, structured curriculum with grammar lessons, vocabulary tracking, and cross-language translation exercises.

## Supported Languages

- English (EN)
- Italian (IT)
- Portuguese (PT)
- Slovenian (SL)
- Spanish (ES)

## Technology Stack

- **Runtime**: Node.js 20.x
- **Language**: TypeScript 5.x
- **Database**: PostgreSQL 15.x
- **API**: Fastify
- **Frontend**: React, Vite, Tailwind CSS
- **Package Manager**: pnpm

## Project Structure

```
polyladder/
├── packages/
│   ├── core/                 # Domain models, business logic
│   ├── db/                   # Database layer, migrations
│   ├── api/                  # REST API server
│   ├── refinement-service/   # Background content generation
│   └── web/                  # React frontend
├── docs/                     # Documentation
└── .github/                  # CI/CD workflows
```

## Development

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 8.0.0
- PostgreSQL 15.x
- Docker (optional, for local DB)

### Setup

```bash
# Clone repository
git clone https://github.com/your-username/polyladder.git
cd polyladder

# Install dependencies
pnpm install

# Start development database
docker-compose up -d

# Run migrations
pnpm --filter @polyladder/db migrate

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

- [Technical Specification](docs/TECHNICAL_SPECIFICATION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Feature Specs](docs/features/)

## License

MIT
