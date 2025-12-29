# Phase 27 Handoff - Import/Export Infrastructure

**Date**: 2025-12-29
**Status**: Complete ✅
**Plan Reference**: content-authoring-eval-plan.md (lines 224-258)

## Summary
Implemented complete import/export infrastructure for batch evaluation JSON files, including file upload component with drag-and-drop, client-side validation, API endpoints for import/export, and in-memory storage for batch data and results.

## Completed Tasks
- [x] Created JsonBatchImport component with drag-and-drop file upload
- [x] Implemented client-side JSON validation before server upload
- [x] Updated BatchEvaluationForm to use JSON import instead of manual rows
- [x] Created in-memory batch storage system (batch-storage.ts)
- [x] Updated import API to store batches in memory
- [x] Implemented export API with Content-Disposition header for file download
- [x] Created BatchExportButton component for downloading results
- [x] Added error handling with user-friendly validation messages
- [x] Created sample file download buttons (5, 10, 20 pages)
- [x] Built test utilities for mock batch results

## Validation Results
| Criterion | Result | Notes |
|-----------|--------|-------|
| User can upload demo-5-pages.json | ✅ PASS | File upload UI works, validates JSON schema |
| Import API validates and returns success/error | ✅ PASS | Zod validation with detailed error messages |
| Export API returns batch results as downloadable JSON | ✅ PASS | Content-Disposition header set correctly |
| Error messages are clear and actionable | ✅ PASS | Shows field paths and specific validation errors |
| UI matches existing ShadCN design system | ✅ PASS | Consistent with Card, Alert, Badge, Button components |
| TypeScript compiles without errors | ✅ PASS | npx tsc --noEmit successful |
| ESLint passes without warnings | ✅ PASS | npm run lint successful |
| Dev server runs without errors | ✅ PASS | Starts on localhost:3001 |

## Artifacts Created
| File | Description |
|------|-------------|
| `src/components/JsonBatchImport.tsx` | File upload component with drag-and-drop, validation, sample links |
| `src/components/BatchExportButton.tsx` | Download button for exporting batch results as JSON |
| `src/components/BatchEvaluationForm.tsx` | Updated to use JSON import instead of manual row entry |
| `src/lib/batch-storage.ts` | In-memory storage for batch data and results (singleton) |
| `src/lib/test-batch-results.ts` | Test utility to create mock batch results |
| `src/app/api/evaluate/import/route.ts` | Updated to store imported batches in memory |
| `src/app/api/evaluate/export/[batchId]/route.ts` | Implemented export with Content-Disposition header |
| `src/app/api/test/mock-results/route.ts` | Test endpoint to create mock results (for testing) |

## Dependencies Added
No new dependencies added. Used existing packages:
- `zod` (already installed in Phase 26)
- `lucide-react` (already installed)
- ShadCN UI components (already installed)

## Key Decisions
- **In-memory storage**: Used Map-based singleton for Phase 27. This will be sufficient for demo and Phase 28 (SSE streaming). Production would replace with database.
- **Drag-and-drop**: Implemented using native HTML5 drag-and-drop API for simplicity.
- **File size limit**: Set 5MB max to prevent abuse. Can be adjusted if needed.
- **Test endpoint**: Created `/api/test/mock-results` for testing export functionality. Should be removed or protected in production.
- **Export button disabled by default**: Since no results exist until Phase 28 implements evaluation, the button is disabled with explanatory alert.

## Playwright Test Evidence
Screenshots saved:
- `/.playwright-mcp/phase-27-batch-mode-ui.png` - Initial batch mode page
- `/.playwright-mcp/phase-27-complete.png` - Full page screenshot

Page structure verified:
- Import card with drag-and-drop area
- Sample file download buttons (5, 10, 20 pages)
- Empty state message when no batch loaded
- All UI elements render correctly with ShadCN styling

## API Test Results
```bash
# Import validation - Success
curl -X POST http://localhost:3001/api/evaluate/import \
  -H "Content-Type: application/json" \
  -d @public/samples/demo-5-pages.json
# Response: {"success":true,"batchId":"demo-5-pages-2025-12-28","pageCount":5}

# Import validation - Invalid URLs
curl -X POST http://localhost:3001/api/evaluate/import \
  -d '{"batchId":"test","pages":[{"id":"page-1","title":"Test","pdfUrl":"invalid","webUrl":"invalid"}]}'
# Response: {"success":false,"error":"Invalid batch format","details":[...]}

# Import validation - Duplicate page IDs
curl -X POST http://localhost:3001/api/evaluate/import \
  -d '{"batchId":"test","pages":[{"id":"page-1",...},{"id":"page-1",...}]}'
# Response: {"success":false,"error":"Invalid batch format","details":[{"message":"Duplicate page IDs found..."}]}

# Export - Not found (no results yet)
curl http://localhost:3001/api/evaluate/export/demo-5-pages-2025-12-28
# Response: {"success":false,"error":"Batch results not found","message":"..."}

# Create mock results (test endpoint)
curl -X POST http://localhost:3001/api/test/mock-results \
  -d '{"batchId":"demo-5-pages-2025-12-28","pageCount":5}'
# Response: {"success":true,"message":"Mock results created..."}

# Export - Success with Content-Disposition
curl -I http://localhost:3001/api/evaluate/export/demo-5-pages-2025-12-28
# Headers include: content-disposition: attachment; filename="batch-demo-5-pages-2025-12-28-results.json"
```

## Known Issues / Blockers
None. Phase 27 is fully complete and ready for Phase 28.

## Notes for Next Phase
**Phase 28 will implement:**
- SSE streaming for batch evaluation
- Real-time table updates with spinners
- Actual batch evaluation engine (currently stub)
- Remove or protect `/api/test/mock-results` endpoint

**Current state:**
- Import workflow is fully functional
- Export workflow is fully functional (tested with mock data)
- BatchEvaluationForm shows uploaded batch info with expandable page list
- "Start Evaluation" button shows Phase 28 coming soon message
- Export button is disabled with alert explaining Phase 28 will enable it

**Batch storage notes:**
- In-memory Map storage is sufficient for demo and Phase 28
- Data persists for session lifetime (cleared on server restart)
- For production, replace with database (e.g., Postgres, SQLite)

## Quick Verification Commands
```bash
# Start dev server
cd /Users/jackjin/dev/azure-da-mcp/content-authoring-eval
npm run dev

# Visit: http://localhost:3001/evaluate/batch

# Test import API
curl -X POST http://localhost:3001/api/evaluate/import \
  -H "Content-Type: application/json" \
  -d @public/samples/demo-5-pages.json

# Create mock results (for testing export)
curl -X POST http://localhost:3001/api/test/mock-results \
  -H "Content-Type: application/json" \
  -d '{"batchId":"demo-5-pages-2025-12-28","pageCount":5}'

# Test export API
curl http://localhost:3001/api/evaluate/export/demo-5-pages-2025-12-28 -o /tmp/exported-results.json
cat /tmp/exported-results.json | jq .

# Verify TypeScript and linting
npx tsc --noEmit
npm run lint
```

## Error Handling Implemented
| Scenario | UI Behavior | API Response |
|----------|-------------|--------------|
| Invalid JSON format | Red alert with parse error and line number | 400 with error message |
| Missing required fields | Red alert with field path and validation message | 400 with details array |
| Invalid URLs | Red alert showing which URLs are invalid | 400 with path and message |
| Duplicate page IDs | Red alert with duplicate ID error | 400 with validation message |
| File too large (>5MB) | Red alert with size limit message | N/A (client-side) |
| Wrong file type (not .json) | Red alert with file type error | N/A (client-side) |
| Batch not found (export) | Red alert with "not found" message | 404 with helpful message |
| Network error | Red alert with error message | N/A (network) |

## UI Components Used
- **ShadCN Components**: Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Alert, AlertDescription, Badge, Input
- **Lucide Icons**: Upload, FileJson, CheckCircle, XCircle, Download, ListChecks, ChevronDown, ChevronRight
- **Tailwind Classes**: Responsive grid, hover states, color-coded badges, smooth transitions

## Phase 27 Success Metrics
✅ All deliverables complete
✅ All validation criteria pass
✅ TypeScript compiles without errors
✅ ESLint passes without warnings
✅ Dev server runs without errors
✅ API endpoints fully functional
✅ UI matches ShadCN design system
✅ Error handling comprehensive
✅ Test utilities created for Phase 28

**Phase 27 Complete**: Ready for Phase 28 (SSE Streaming & Real-time Table Updates)
