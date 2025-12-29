---
applyTo: "functions/src/modules/DaliveClient.js"
---

# da.live API Client Instructions

## Critical Requirements

**Multipart Form Data Required**: da.live POST API only accepts `multipart/form-data`.

### Correct Implementation Pattern

```javascript
import FormData from 'form-data';
import axios from 'axios';

export async function updateContent(path, htmlContent, bearerToken) {
    const formData = new FormData();
    
    // CRITICAL: Use 'data' field name with Buffer
    formData.append('data', Buffer.from(htmlContent), {
        filename: 'content.html',
        contentType: 'text/html'
    });

    // CRITICAL: POST directly to path (NO /api prefix)
    const url = `${DALIVE_API_URL}${path}`;
    
    const response = await axios.post(url, formData, {
        headers: {
            'Authorization': `Bearer ${bearerToken}`,
            ...formData.getHeaders()  // Essential for boundary
        },
        timeout: 5000
    });

    return response.data;
}
```

### URL Structure Rules

**✅ Correct URLs:**
- `POST https://admin.da.live/source/owner/site/page.html`
- `GET https://admin.da.live/source/owner/site/page.html`

**❌ Wrong URLs:**
- `POST https://admin.da.live/api/source/owner/site/page.html` (404 error)
- `GET https://admin.da.live/api/source/owner/site/page.html` (404 error)

### Content Fetching

```javascript
export async function getContent(path, bearerToken) {
    const url = `${DALIVE_API_URL}${path}`;
    
    const response = await axios.get(url, {
        headers: {
            'Authorization': `Bearer ${bearerToken}`
        },
        timeout: 5000
    });

    // da.live returns HTML as plain text
    return response.data;
}
```

## Error Handling

### Common Error Scenarios

```javascript
export async function updateContent(path, htmlContent, bearerToken) {
    try {
        // Implementation here
    } catch (error) {
        if (error.response?.status === 401) {
            throw new Error('Invalid Bearer token');
        } else if (error.response?.status === 404) {
            throw new Error(`Path not found: ${path}`);
        } else if (error.response?.status === 403) {
            throw new Error('Insufficient permissions for path');
        } else if (error.code === 'ECONNABORTED') {
            throw new Error('Request timeout');
        } else {
            throw new Error(`da.live API error: ${error.message}`);
        }
    }
}
```

## Environment Variables

```javascript
const DALIVE_API_URL = process.env.DALIVE_API_URL || 'https://admin.da.live';
```

## Path Validation

```javascript
function validatePath(path) {
    if (!path) {
        throw new Error('Path is required');
    }
    
    if (!path.startsWith('/source/')) {
        throw new Error('Path must start with /source/');
    }
    
    // Path format: /source/{owner}/{site}/{page.html}
    const pathParts = path.split('/');
    if (pathParts.length < 4) {
        throw new Error('Path must include owner and site: /source/{owner}/{site}/...');
    }
}
```

## Authentication

**Bearer Token**: Always passed via `Authorization: Bearer {token}` header
**Source**: Extracted from request Authorization header in Azure Functions

## Response Format

### GET Responses
- **Success**: Plain HTML string
- **404**: Path not found
- **401**: Invalid token
- **403**: No access to path

### POST Responses  
- **Success**: Usually empty response with 200 status
- **400**: Invalid multipart data
- **401**: Invalid token
- **403**: No write access
- **404**: Path not found

## Dependencies

```javascript
// Required imports
import FormData from 'form-data';  // NOT 'form-data/lib/form_data'
import axios from 'axios';
```

## Testing with Real API

```javascript
// E2E test pattern
test('da.live API integration', async () => {
    const token = process.env.DALIVE_BEARER_TOKEN;
    const testPath = '/source/test/integration/test.html';
    
    // Test GET
    const originalContent = await daliveClient.getContent(testPath, token);
    expect(typeof originalContent).toBe('string');
    
    // Test POST
    const modifiedContent = originalContent + '\n<!-- test -->';
    await daliveClient.updateContent(testPath, modifiedContent, token);
    
    // Verify change
    const updatedContent = await daliveClient.getContent(testPath, token);
    expect(updatedContent).toContain('<!-- test -->');
});
```