# PolyLadder

Web application for parallel language learning.

## About

PolyLadder lets you study multiple related languages simultaneously — Spanish, Italian, Portuguese — leveraging their similarities and explicitly working through differences. The system shows grammar comparatively, tracks confusion between languages, and generates exercises targeting problem areas.

Implemented: authentication, onboarding, orthography/vocabulary/grammar modules, 7 practice modes, spaced repetition, progress tracking. Status: 92% complete.

## Technology

Backend: Node.js 20, TypeScript, Fastify, PostgreSQL. Frontend: React 18, Vite, Tailwind CSS. Monorepo with pnpm workspace.

## Development

Requires access to private PolyLadderCommon repository for shared code and documentation.

```bash
# Clone both repositories into same directory
git clone https://github.com/arina-fedorova/PolyLadder.git
git clone <private>/PolyLadderCommon.git

cd PolyLadder
pnpm install
pnpm dev
```

## Documentation

All documentation in [PolyLadderCommon/docs](../PolyLadderCommon/docs/). Main document: [PROJECT_CONTEXT.md](../PolyLadderCommon/docs/polyladder/PROJECT_CONTEXT.md).

## Related Projects

- **PolyLadderCommon** — shared code and documentation (private)
- **PolyLadderAdmin** — operator dashboard for content management (private)
- **[MultilingualVoiceAssistant](https://github.com/arina-fedorova/MultilingualVoiceAssistant)** — voice assistant for pronunciation practice
