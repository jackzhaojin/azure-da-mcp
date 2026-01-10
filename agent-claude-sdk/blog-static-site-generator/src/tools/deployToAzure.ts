/**
 * Deploy to Azure
 * Uploads static site to Azure Blob Storage using az CLI
 */

import { execSync } from 'child_process';

export interface DeployToAzureInput {
  sourceDir: string;
  storageAccount: string;
  resourceGroup: string;
  containerName?: string; // Default: '$web'
}

export interface DeployToAzureResult {
  success: boolean;
  url?: string;
  error?: string;
}

export async function deployToAzure(
  input: DeployToAzureInput
): Promise<DeployToAzureResult> {
  const containerName = input.containerName || '$web';

  try {
    // Verify az CLI is available
    try {
      execSync('az --version', { stdio: 'ignore' });
    } catch (error) {
      return {
        success: false,
        error: 'Azure CLI (az) is not installed or not in PATH',
      };
    }

    // Verify user is logged in
    try {
      execSync('az account show', { stdio: 'ignore' });
    } catch (error) {
      return {
        success: false,
        error: 'Not logged in to Azure CLI. Run: az login',
      };
    }

    // Enable static website on storage account
    console.log('Enabling static website...');
    execSync(
      `az storage blob service-properties update \
        --account-name ${input.storageAccount} \
        --static-website \
        --index-document index.html \
        --404-document index.html`,
      { stdio: 'inherit' }
    );

    // Upload files
    console.log('Uploading files to Azure...');
    execSync(
      `az storage blob upload-batch \
        --account-name ${input.storageAccount} \
        --source "${input.sourceDir}" \
        --destination "${containerName}" \
        --overwrite`,
      { stdio: 'inherit' }
    );

    // Get deployed URL
    const urlCmd = `az storage account show \
      --name ${input.storageAccount} \
      --resource-group ${input.resourceGroup} \
      --query "primaryEndpoints.web" \
      --output tsv`;

    const url = execSync(urlCmd, { encoding: 'utf-8' }).trim();

    return {
      success: true,
      url,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Deployment failed',
    };
  }
}
