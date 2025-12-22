# Found Bugs and Issues

## Medium Issues

---

### 2. Missing validation for file uploads

**File**: `packages/api/src/routes/operational/documents.ts`

**Issue**: File upload endpoint may not validate file size, type, or content properly

**Current Status**: Basic validation exists:

- File type validation (PDF, DOCX only)
- File size limit (50MB)
- MIME type checking

**Risk**: Low - basic validation exists, but could add content validation

**Recommendation**: Add content validation (magic bytes check) and virus scanning for production

**Priority**: Medium

**Status**: ⚠️ Needs review (basic validation exists)

---

## Low Issues / Improvements

### 3. Missing caching for statistics

**Issue**: Statistics are recalculated on every request

**Risk**: Low - acceptable for MVP, but may be slow on large datasets

**Recommendation**: Add materialized view or caching

**Priority**: Low

**Status**: ⚠️ Not fixed

---

### 4. Missing environment variable examples

**Issue**: No `.env.example` files in packages to guide developers

**Risk**: Low - developers may not know required environment variables

**Recommendation**: Create `.env.example` files (blocked by .gitignore, but documented in this file)

**Priority**: Low

**Status**: ⚠️ Not fixed (files blocked by .gitignore, but documented below)

---

## Documentation and Implementation Mismatches

### 5. F014-F016: Content Pipeline - missing implementation verification

**Issue**: Need to verify that document processing, semantic mapping, and content transformation are fully implemented

**Status**: ⚠️ Needs verification

---

## Environment Variables

### API Package (`packages/api/.env`)

Required variables:

- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret key for JWT tokens (min 32 chars)
- `FRONTEND_URL` - Frontend URL for CORS

Optional variables:

- `JWT_ACCESS_EXPIRY` - Access token expiry (default: 15m)
- `JWT_REFRESH_EXPIRY` - Refresh token expiry (default: 7d)
- `PORT` - Server port (default: 3000)
- `HOST` - Server host (default: 0.0.0.0)
- `NODE_ENV` - Environment (development/production/test)
- `LOG_LEVEL` - Logging level (default: info)
- `RATE_LIMIT_MAX` - Max requests per window (default: 100)
- `RATE_LIMIT_WINDOW` - Rate limit window (default: 1 minute)

### Web Package (`packages/web/.env`)

Required variables:

- `VITE_API_URL` - API base URL (default: http://localhost:3000/api/v1)

### Refinement Service (`packages/refinement-service/.env`)

Required variables:

- `DATABASE_URL` - PostgreSQL connection string
- `ANTHROPIC_API_KEY` - Anthropic API key for content generation

Optional variables:

- `LOG_LEVEL` - Logging level (default: info)

---

## Manual Testing Checklist

### Security

- [ ] Check authorization on all endpoints
- [ ] Check rate limiting

### Functionality

- [ ] Test all auth endpoints
- [ ] Test approve/reject workflow
- [ ] Test feedback system
- [ ] Test bulk operations
- [ ] Test filtering and search
- [ ] Test export
- [ ] Test document upload and processing
- [ ] Test semantic mapping
- [ ] Test content transformation

### Performance

- [ ] Check API response time
- [ ] Test with large datasets
- [ ] Test dashboard auto-refresh
- [ ] Test document processing performance

### UX

- [ ] Check optimistic updates
- [ ] Check error handling
- [ ] Check loading states
- [ ] Check responsive design

---

## Testing Notes

### Known Test Issues

1. **Race conditions in integration tests**: Tests may fail intermittently due to parallel execution
   - **Solution**: Tests run sequentially with `singleFork: true` in Vitest config

2. **Database cleanup**: Test data may persist between test runs
   - **Solution**: `cleanupTestData()` function in test setup

3. **E2E test isolation**: E2E tests run serially to prevent database conflicts
   - **Solution**: `fullyParallel: false` and `workers: 1` in Playwright config
