/**
 * E2E Test: Verify save_dalive_content returns URLs from da.live
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

// Load .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../../.env');

if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const path = '/source/jackzhaojin/da-live-postal-2025-07/index-copy.html';
const bearerToken = process.env.DALIVE_BEARER_TOKEN;

if (!bearerToken) {
  console.error('❌ DALIVE_BEARER_TOKEN environment variable not set');
  process.exit(1);
}

async function testUrlsInResponse() {
  try {
    console.log('🧪 Testing save_dalive_content URLs response...\n');

    // Call MCP server to save content
    const mcpResponse = await fetch('http://localhost:7071/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearerToken}`
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0' }
        },
        id: 1
      })
    });

    const initResult = await mcpResponse.json();
    const sessionId = mcpResponse.headers.get('mcp-session-id');
    console.log('✅ MCP session initialized:', initResult.result.serverInfo.name);
    console.log('   Session ID:', sessionId);

    // Send initialized notification
    await fetch('http://localhost:7071/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearerToken}`,
        'Mcp-Session-Id': sessionId || ''
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialized',
        params: {}
      })
    });
    console.log('✅ Sent initialized notification\n');

    // Get current content
    const getResponse = await fetch('http://localhost:7071/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearerToken}`,
        'Mcp-Session-Id': sessionId || ''
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'get_dalive_content',
          arguments: { path }
        },
        id: 2
      })
    });

    const getResult = await getResponse.json();
    console.log('Get response:', JSON.stringify(getResult, null, 2));

    if (getResult.error) {
      throw new Error(`Failed to get content: ${getResult.error.message}`);
    }

    const htmlContent = getResult.result?.structuredContent?.htmlContent;
    console.log(`✅ Fetched content (${htmlContent?.length || 0} chars)\n`);

    // Save with a small modification
    const modifiedHtml = htmlContent?.replace('<title>', '<title>TEST - ') || '<html><title>TEST</title><body>Test content</body></html>';

    const saveResponse = await fetch('http://localhost:7071/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearerToken}`,
        'Mcp-Session-Id': sessionId || ''
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'save_dalive_content',
          arguments: {
            path,
            htmlContent: modifiedHtml
          }
        },
        id: 3
      })
    });

    const saveResult = await saveResponse.json();

    console.log('📦 Save response:');
    console.log(JSON.stringify(saveResult, null, 2));

    // Check for URLs in response
    const structuredContent = saveResult.result?.structuredContent;

    if (!structuredContent?.urls) {
      console.error('\n❌ URLs not found in response!');
      process.exit(1);
    }

    console.log('\n✅ URLs returned from da.live:');
    console.log('   Edit URL:', structuredContent.urls.editUrl);
    console.log('   Content URL:', structuredContent.urls.contentUrl);
    if (structuredContent.urls.previewUrl) {
      console.log('   Preview URL:', structuredContent.urls.previewUrl);
    }
    if (structuredContent.urls.liveUrl) {
      console.log('   Live URL:', structuredContent.urls.liveUrl);
    }

    // Verify required URLs are present (editUrl and contentUrl are always returned by da.live)
    const requiredUrlsPresent =
      structuredContent.urls.editUrl &&
      structuredContent.urls.contentUrl;

    if (!requiredUrlsPresent) {
      console.error('\n❌ Required URLs (editUrl, contentUrl) are missing!');
      process.exit(1);
    }

    console.log('\n✅ Required URLs present and returned to MCP client');
    console.log('✅ LLM can now access these URLs in tool response');
    console.log('\nNote: previewUrl and liveUrl may not be available depending on da.live configuration');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

testUrlsInResponse();
