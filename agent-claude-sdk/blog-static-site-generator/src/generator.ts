/**
 * Static Site Generator
 * Main orchestrator that coordinates all generation steps
 */

import { parseSpec } from './tools/parseSpec.js';
import { parseDesignSystem } from './tools/parseDesignSystem.js';
import { generateCss } from './tools/generateCss.js';
import { generateBlogContents } from './contentGenerator.js';
import { generateBlogHtml } from './tools/generateBlogHtml.js';
import { generateLandingPage } from './tools/generateLandingPage.js';
import { deployToAzure } from './tools/deployToAzure.js';
// Types imported below
import type { BlogPageInfo } from './tools/generateLandingPage.js';

export interface StaticSiteResult {
  success: boolean;
  messages: string[];
  deployedUrl?: string;
  error?: string;
}

export async function generateStaticSite(
  specPath: string
): Promise<StaticSiteResult> {
  const messages: string[] = [];

  try {
    // Step 1: Parse spec file
    messages.push('📖 Parsing specification...');
    const parseResult = await parseSpec({ specPath });

    if (!parseResult.success || !parseResult.spec) {
      return {
        success: false,
        messages,
        error: parseResult.error || 'Failed to parse spec',
      };
    }

    const spec = parseResult.spec;
    messages.push(`   Theme: ${spec.content.theme}`);
    messages.push(`   Blogs: ${spec.content.count}`);
    messages.push(`   Design System: ${spec.designSystem.path}\n`);

    // Step 2: Parse design system
    messages.push('🎨 Loading design system...');
    const designSystemResult = await parseDesignSystem({
      path: spec.designSystem.path,
      format: spec.designSystem.format,
    });

    if (!designSystemResult.success || !designSystemResult.designSystem) {
      return {
        success: false,
        messages,
        error: designSystemResult.error || 'Failed to parse design system',
      };
    }

    const designSystem = designSystemResult.designSystem;
    const blockCount = Object.keys(designSystem.blocks).length;
    const tokenCategories = Object.keys(designSystem.tokens).length;
    messages.push(`   Loaded ${blockCount} blocks, ${tokenCategories} token categories\n`);

    // Step 3: Generate CSS
    messages.push('💅 Generating CSS from tokens...');
    const cssResult = await generateCss({
      designSystem,
      outputDir: spec.output.directory,
    });

    if (!cssResult.success) {
      return {
        success: false,
        messages,
        error: cssResult.error || 'Failed to generate CSS',
      };
    }

    messages.push(`   CSS generated: ${cssResult.cssPath}\n`);

    // Step 4: Generate blog content (AI)
    messages.push(`🤖 Generating ${spec.content.count} blog posts with AI...`);
    const contentResult = await generateBlogContents({
      count: spec.content.count,
      theme: spec.content.theme,
      topics: spec.content.topics,
      designSystem,
      outputDir: spec.output.directory,
    });

    if (!contentResult.success || !contentResult.contents) {
      return {
        success: false,
        messages: [...messages, ...contentResult.messages],
        error: contentResult.error || 'Failed to generate blog content',
      };
    }

    messages.push(...contentResult.messages);
    messages.push('');

    // Step 5: Generate blog HTML pages
    messages.push('📄 Generating HTML pages...');
    const blogPages: BlogPageInfo[] = [];

    for (let i = 0; i < contentResult.contents.length; i++) {
      const content = contentResult.contents[i];
      const htmlResult = await generateBlogHtml({
        content,
        outputDir: spec.output.directory,
        postNumber: i + 1,
      });

      if (htmlResult.success && htmlResult.filename) {
        blogPages.push({
          title: content.title,
          teaser: content.teaser,
          filename: htmlResult.filename,
          date: content.metadata.date,
          tags: content.metadata.tags,
          heroImage: content.heroImage,
        });
        messages.push(`   ✓ ${htmlResult.filename}`);
      } else {
        messages.push(`   ✗ Failed to generate HTML for post ${i + 1}`);
      }
    }

    messages.push('');

    // Step 6: Generate landing page (if requested)
    if (spec.output.includeLandingPage) {
      messages.push('🏠 Generating landing page...');
      const landingResult = await generateLandingPage({
        blogPages,
        siteTitle: spec.output.siteTitle || 'Blog',
        siteDescription: spec.output.siteDescription,
        outputDir: spec.output.directory,
      });

      if (landingResult.success) {
        messages.push(`   Landing page: ${landingResult.indexPath}\n`);
      } else {
        messages.push(`   Warning: ${landingResult.error}\n`);
      }
    }

    // Step 7: Deploy to Azure (if configured)
    let deployedUrl: string | undefined;
    if (spec.deployment) {
      messages.push('☁️  Deploying to Azure...');
      const deployResult = await deployToAzure({
        sourceDir: spec.output.directory,
        storageAccount: spec.deployment.storageAccount,
        resourceGroup: spec.deployment.resourceGroup,
        containerName: spec.deployment.containerName,
      });

      if (deployResult.success) {
        deployedUrl = deployResult.url;
        messages.push(`   Deployed to: ${deployedUrl}\n`);
      } else {
        messages.push(`   Deployment failed: ${deployResult.error}\n`);
      }
    }

    return {
      success: true,
      messages,
      deployedUrl,
    };
  } catch (error) {
    messages.push(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return {
      success: false,
      messages,
      error: error instanceof Error ? error.message : 'Generation failed',
    };
  }
}
