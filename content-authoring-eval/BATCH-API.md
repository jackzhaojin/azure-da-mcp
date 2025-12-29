# Batch Evaluation API Documentation

**Phase 26**: JSON Schema & API Design
**Status**: API stubs created, implementation in Phase 27-28

---

## Overview

The Batch Evaluation API enables processing multiple pages in a single request with real-time streaming updates. This is designed for CMS migration scenarios where you need to evaluate 5-50 pages at once.

---

## API Endpoints

### 1. Import Batch JSON

**Endpoint**: `POST /api/evaluate/import`
**Status**: Implemented (Phase 26)
**Purpose**: Validate and store batch JSON for evaluation

**Request Body**:
```json
{
  "batchId": "migration-2025-01-15",
  "pages": [
    {
      "id": "page-001",
      "title": "Homepage",
      "pdfUrl": "https://example.com/pdf/homepage.pdf",
      "webUrl": "https://www.example.com/"
    }
  ]
}
```

**Response** (Success):
```json
{
  "success": true,
  "batchId": "migration-2025-01-15",
  "pageCount": 1,
  "message": "Batch validated successfully. Ready for evaluation."
}
```

**Response** (Validation Error):
```json
{
  "success": false,
  "error": "Invalid batch format",
  "details": [
    {
      "path": "pages.0.pdfUrl",
      "message": "PDF URL must be a valid URL"
    }
  ]
}
```

**Validation Rules**:
- `batchId`: Required, alphanumeric with hyphens/underscores
- `pages`: Array of 1-50 pages
- `pages[].id`: Unique within batch, alphanumeric with hyphens/underscores
- `pages[].title`: 1-200 characters
- `pages[].pdfUrl`: Valid URL
- `pages[].webUrl`: Valid URL

---

### 2. Start Batch Evaluation (SSE Streaming)

**Endpoint**: `POST /api/evaluate/batch-stream`
**Status**: Stub (Phase 26), Implementation in Phase 28
**Purpose**: Start batch evaluation with real-time SSE progress updates

**Request Body**: Same as `/api/evaluate/import`

**Response**: SSE stream (`text/event-stream`)

**Event Types**:
- `page:queued` - Page added to queue
- `page:started` - Page evaluation started
- `dimension:started` - Dimension (structure/a11y/content/visual) started
- `dimension:completed` - Dimension completed with score
- `page:completed` - All 4 dimensions completed
- `page:error` - Evaluation failed for page
- `batch:completed` - Entire batch finished

**Event Format**:
```
event: dimension:completed
data: {"type":"dimension:completed","batchId":"migration-2025-01-15","pageId":"page-001","dimension":"structure","status":"completed","score":85,"findings":[...],"timestamp":"2025-12-28T10:05:00.000Z"}

event: page:completed
data: {"type":"page:completed","batchId":"migration-2025-01-15","pageId":"page-001","timestamp":"2025-12-28T10:06:00.000Z"}

event: batch:completed
data: {"type":"batch:completed","batchId":"migration-2025-01-15","timestamp":"2025-12-28T10:30:00.000Z"}
```

---

### 3. Export Batch Results

**Endpoint**: `GET /api/evaluate/export/:batchId`
**Status**: Stub (Phase 26), Implementation in Phase 27
**Purpose**: Download completed batch results as JSON

**Response** (Success):
```json
{
  "batchId": "migration-2025-01-15",
  "startedAt": "2025-01-15T10:00:00.000Z",
  "completedAt": "2025-01-15T10:45:00.000Z",
  "totalPages": 20,
  "results": [
    {
      "pageId": "page-001",
      "title": "Homepage",
      "overallScore": 78,
      "overallGrade": "Good",
      "dimensions": {
        "structure": {
          "score": 85,
          "grade": "Good",
          "findings": [...]
        },
        "accessibility": {
          "score": 72,
          "grade": "Acceptable",
          "findings": [...]
        },
        "content": {
          "score": 90,
          "grade": "Excellent",
          "findings": [...]
        },
        "visual": {
          "score": 65,
          "grade": "Acceptable",
          "findings": [...]
        }
      },
      "evaluatedAt": "2025-01-15T10:05:00.000Z"
    }
  ]
}
```

---

## Sample Data

Sample batch JSON files are provided in `/public/samples/`:

1. **demo-5-pages.json** - Quick demo (5 pages, ~2-3 min)
2. **demo-10-pages.json** - Medium demo (10 pages, ~5-7 min)
3. **demo-20-pages.json** - Full demo (20 pages, ~10-15 min)

**Usage**:
```bash
curl -X POST http://localhost:3000/api/evaluate/import \
  -H 'Content-Type: application/json' \
  -d @public/samples/demo-5-pages.json
```

---

## Grading System

| Grade | Score Range | Description |
|-------|-------------|-------------|
| Excellent | 90-100 | Exceeds original quality |
| Good | 75-89 | Matches original, minor issues |
| Acceptable | 60-74 | Functional, some issues |
| Needs Improvement | 40-59 | Significant issues |
| Critical | 0-39 | Not production-ready |

**Overall Score Calculation**:
```
overallScore = (structure + accessibility + content + visual) / 4
```

All dimensions weighted equally (25% each).

---

## Error Handling

### Invalid JSON Format
```json
{
  "success": false,
  "error": "Invalid batch format",
  "details": [
    {
      "path": "pages",
      "message": "At least one page is required"
    }
  ]
}
```

### Duplicate Page IDs
```json
{
  "success": false,
  "error": "Invalid batch format",
  "details": [
    {
      "path": "",
      "message": "Duplicate page IDs found. Each page must have a unique ID."
    }
  ]
}
```

### Too Many Pages
```json
{
  "success": false,
  "error": "Invalid batch format",
  "details": [
    {
      "path": "pages",
      "message": "Maximum 50 pages per batch"
    }
  ]
}
```

---

## TypeScript Types

All types are defined in:
- `/src/types/evaluation.ts` - Core types
- `/src/lib/validation/batch-schema.ts` - Zod validation schemas

**Key Types**:
- `BatchEvaluationInput` - Input JSON schema
- `BatchEvaluationOutput` - Output JSON schema
- `BatchPage` - Single page in batch
- `BatchPageResult` - Single page result
- `DimensionResult` - Dimension scores and findings
- `BatchEvaluationEvent` - SSE event payload

---

## Implementation Status

| Phase | Feature | Status |
|-------|---------|--------|
| **26** | TypeScript types | Complete |
| **26** | Zod validation schemas | Complete |
| **26** | Sample JSON files | Complete |
| **26** | API route stubs | Complete |
| 27 | Import/Export UI | Planned |
| 27 | File upload/download | Planned |
| 28 | SSE streaming implementation | Planned |
| 28 | Real-time table updates | Planned |

---

## Next Steps

### Phase 27: Import/Export Infrastructure
- File upload component with drag-and-drop
- JSON validation with user-friendly errors
- Export button with download functionality
- localStorage for batch history

### Phase 28: Streaming UX
- SSE stream implementation with TransformStream
- ShadCN table with live updates
- Spinner → Score transitions
- Color-coded score display

---

*Last Updated: 2025-12-28 (Phase 26 Complete)*
