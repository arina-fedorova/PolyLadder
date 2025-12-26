# PolyLadder Operator Guide

## Overview

This guide is for PolyLadder operators who manage content, upload documents, and monitor the processing pipeline.

---

## Logging In

### Test Accounts

For local development, test users are automatically created:

- **Operator**: `operator@test.com` / `password123`
- **Learner**: `learner@test.com` / `password123`

### Login Process

1. Open http://localhost:5173
2. Click "Login"
3. Enter operator email and password
4. After login, you'll be redirected to the Operator Dashboard

---

## Working with Documents

### Uploading a Document

1. Navigate to **Document Library** (in the left menu)
2. Click the **"Upload Document"** button (top right corner)
3. In the modal window:
   - Select a file (PDF or DOCX)
   - Specify the document language (e.g., ES for Spanish)
   - Select target CEFR level (optional)
   - Choose document type (textbook, grammar_guide, vocabulary_list, dialogue_corpus, exercise_book, other)
   - Add title and description (optional)
4. Click **"Upload"**

### What Happens After Upload

After you upload a document:

1. **File Storage**: The file is saved securely on the server with a unique identifier
2. **Automatic Processing**: The system automatically starts processing your document:
   - Extracts text from the PDF
   - Breaks it into meaningful chunks
   - Prepares it for content generation
3. **Status Updates**: You can track the processing progress in the document list:
   - **Pending** → Document is queued for processing
   - **Extracting** → Text is being extracted from the PDF
   - **Chunking** → Document is being split into chunks
   - **Ready** → Processing complete, ready for use
   - **Error** → Something went wrong (check error message)

**Note**: Each uploaded file receives a unique name to prevent conflicts. Your original filename is preserved for display purposes.

### Document Statuses

- **Pending** - Document uploaded, awaiting processing
- **Extracting** - Text extraction from PDF in progress
- **Chunking** - Text is being split into semantic chunks
- **Ready** - Document processed, ready for topic mapping
- **Error** - An error occurred during processing

### Viewing Document Details

1. In the document list, click the **eye icon** (👁️) next to a document
2. In the modal window you'll see:
   - Basic information (filename, status, language, level)
   - Number of pages and chunks
   - Processing log (showing all processing steps)
   - List of all chunks with details:
     - Chunk number
     - Page number
     - Type (paragraph, heading, list, etc.)
     - Confidence level
     - Word count
   - Error messages (if status is Error)

**What the statuses mean:**

- **Pending** - Document uploaded, waiting to be processed
- **Extracting** - Text is being extracted from PDF
- **Chunking** - Text is being split into semantic chunks
- **Ready** - Document processed successfully, chunks created and ready for mapping to topics
- **Error** - Something went wrong during processing

### Deleting a Document

1. Click the **trash icon** (🗑️) next to a document
2. Confirm deletion

**Warning**: Deleting a document will also delete all associated chunks and mappings.

---

## Working with Curriculum

### Viewing Levels and Topics

1. Navigate to **Curriculum** (in the left menu)
2. You'll see a tree of CEFR levels (A1, A2, B1, B2, C1, C2)
3. Expand a level to see topics

### Adding a Topic

1. Select the level where you want to add a topic
2. Click the **"Add Topic"** button
3. Fill in the form:
   - **Slug** - unique identifier (e.g., `greetings`)
   - **Name** - topic name
   - **Content Type** - content type (vocabulary, grammar, orthography)
   - **Description** - topic description
   - **Prerequisites** - prerequisite topics (optional)
4. Click **"Create"**

### Bulk Topic Import

1. In the Curriculum section, click **"Bulk Import"**
2. Select the level for import
3. In the modal window:
   - Upload a JSON file with topics, or
   - Paste JSON directly into the text field
4. JSON format:
   ```json
   [
     {
       "slug": "greetings",
       "name": "Greetings",
       "contentType": "vocabulary",
       "description": "Basic greetings",
       "levelId": "level-uuid"
     }
   ]
   ```
5. Click **"Import"**
6. Review results:
   - Number of successfully created topics
   - List of errors (if any)

---

## Working with Content

### Viewing Candidates for Approval

1. Navigate to **Review Queue** (in the left menu)
2. You'll see a list of content awaiting approval:
   - Vocabulary items
   - Grammar rules
   - Orthography exercises
3. For each item:
   - Review the content
   - Check validation results
   - Click **"Approve"** or **"Reject"**

### Viewing Approved Content

1. Navigate to **Corpus Explorer** (in the left menu)
2. Use filters to search:
   - By content type
   - By CEFR level
   - By language
   - By topic
3. View details of any item

### Viewing Mappings (chunk → topic connections)

**Important**: Mappings are created automatically by the system, but only if:

1. The document is in **Ready** status
2. There are **topics** in Curriculum for the document's language and level
3. The Refinement Service has **ANTHROPIC_API_KEY** configured (for AI mapping)

**How mappings work:**

1. After a document reaches **Ready** status, the system automatically tries to map chunks to topics
2. The AI analyzes each chunk and suggests which curriculum topic it belongs to
3. Mappings appear in **Mapping Review** for your approval

**To view and approve mappings:**

1. Navigate to **Mapping Review** (in the left menu)
2. You'll see AI-proposed connections between document chunks and topics
3. For each mapping:
   - Review the source chunk from the document
   - Review the proposed topic
   - Read the AI reasoning
   - Click **"Confirm"** to approve or **"Reject"** to decline
4. After confirming mappings, the system will generate learning content from the chunks

**If you don't see any mappings:**

- Check that you have topics in Curriculum for the document's language and level
- Check that ANTHROPIC_API_KEY is configured (check Refinement Service status on Dashboard)
- The system may still be processing - wait a few minutes and refresh

---

## System Monitoring

### Operator Dashboard

On the main Dashboard page you'll see:

- **Refinement Service Status**:
  - **Running** - service is working and processing content
  - **Stopped** - service is stopped (no work or issues)
  - **Error** - an error occurred
  - Last Checkpoint - time of last activity
  - Items Processed Today - number of processed items today
  - Avg Processing Time - average processing time

- **Pipeline Health**:
  - Overall status (healthy/warning/critical)
  - Number of stuck items
  - Error rate
  - Throughput

- **Content Statistics**:
  - Amount of approved content by type
  - Number of candidates
  - Number of drafts

### Document Processing Issues

**If documents remain in Pending status:**

1. Check the Refinement Service status on the Dashboard
2. If status is **Stopped**, check logs:
   ```bash
   docker logs polyladder-refinement-dev --tail 50
   ```
3. Possible causes:
   - Service is not running
   - Errors processing files
   - Database issues

**If documents are Ready but no mappings appear:**

1. **Check Curriculum Topics**: You need topics in Curriculum for the document's language and level
   - Go to **Curriculum** page
   - Select the document's language (e.g., Spanish)
   - Expand the document's level (e.g., A1)
   - If no topics exist, create them using "Add Topic" or "Bulk Import"

2. **Check ANTHROPIC_API_KEY**: Mappings require AI, so the API key must be configured
   - Check Refinement Service status on Dashboard
   - If it shows "ANTHROPIC_API_KEY not set", mappings won't be created

3. **Wait for processing**: The system processes documents in batches, so it may take a few minutes

**Complete workflow after document is Ready:**

1. ✅ Document processed → Status: **Ready** (chunks created)
2. ⏳ System maps chunks to topics (automatic, requires topics and API key)
3. 👁️ Review mappings in **Mapping Review** page
4. ✅ Confirm mappings → System generates learning content
5. 📚 Content appears in **Review Queue** for final approval
6. ✅ Approve content → Available in **Corpus Explorer**

---

## Frequently Asked Questions

### Why do I see many test.pdf documents?

These are test data from integration tests. They are created automatically when tests run and remain in the database.

**Solution**: You can delete them manually via UI or clean the database:

```bash
docker exec polyladder-db-dev psql -U dev -d polyladder -c "DELETE FROM document_sources WHERE original_filename = 'test.pdf';"
```

### Why aren't documents being processed?

Documents are processed automatically by the Refinement Service, but only if:

1. The service is running and operational
2. ANTHROPIC_API_KEY is set (for LLM operations)
3. The document is in Pending status

If documents remain in Pending status for a long time, check the refinement service logs.

### Where are uploaded files stored?

Uploaded files are stored securely on the server. You don't need to worry about their physical location - the system handles all file management automatically. Files are:

- Stored with unique identifiers to prevent conflicts
- Automatically processed by the system
- Accessible through the Document Library interface
- Protected and backed up according to system policies

If you need to access a specific file, use the Document Library interface - click the eye icon (👁️) next to any document to view its details and download it if needed.

### How to clean test data?

1. Via UI: delete documents manually
2. Via SQL:
   ```bash
   docker exec polyladder-db-dev psql -U dev -d polyladder -c "DELETE FROM document_sources WHERE original_filename = 'test.pdf';"
   ```

### Difference between E2E tests and local development

- **E2E tests** use a **separate database** (`polyladder_e2e` on port 5433)
- **Local development** uses database `polyladder` on port 5432
- They **do NOT overlap** - tests don't affect your data

However, **integration tests** may use the same database if not configured properly. Check the `DATABASE_URL` environment variable when running tests.

---

## Useful Commands

### View Logs

```bash
# API logs
docker logs polyladder-api-dev --tail 50 -f

# Refinement Service logs
docker logs polyladder-refinement-dev --tail 50 -f

# Database logs
docker logs polyladder-db-dev --tail 50 -f
```

### Check Service Status

```bash
docker ps --filter "name=polyladder"
```

### Connect to Database

```bash
docker exec -it polyladder-db-dev psql -U dev -d polyladder
```

### View Uploaded Files

Use the Document Library interface in the web application to view all uploaded files. Click the eye icon (👁️) next to any document to see its details.

---

## Support

If you encounter issues:

1. Check service logs
2. Check status on Dashboard
3. Contact developers with problem description and logs

---

_Last updated: 2025-12-26_
