/**
 * Utility functions for managing timestamped output directories
 */

import path from 'path';
import fs from 'fs/promises';

/**
 * Generate a path-friendly ISO timestamp for folder names
 * Format: YYYY-MM-DD-HHmm (e.g., "2025-12-21-1345")
 */
export function getTimestampedFolderName(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}-${hours}${minutes}`;
}

/**
 * Create a timestamped output directory structure
 *
 * If baseDir is provided and appears to be a run directory already, uses it as-is.
 * Otherwise, creates a new timestamped directory.
 *
 * @param baseDir - Optional base directory. If provided and initialized, used as-is
 * @param inputFileName - Optional input file name to include in folder name (e.g., "test-migration")
 *
 * Returns: { runDir, reportsDir, screenshotsDir, dashboardsDir, lighthouseDir, axeDir }
 */
export async function createTimestampedOutputDirs(
  baseDir?: string,
  inputFileName?: string
): Promise<{
  runDir: string;
  reportsDir: string;
  screenshotsDir: string;
  dashboardsDir: string;
  lighthouseDir: string;
  axeDir: string;
}> {
  let runDir: string;

  // If baseDir is provided and looks like a run directory (has subdirs), use it as-is
  // This handles the case where a batch creates a timestamped dir and passes it to individual evaluations
  if (baseDir) {
    const reportsSubdir = path.join(baseDir, 'reports');
    try {
      // Check if this looks like an already-initialized run directory
      await fs.access(reportsSubdir);
      runDir = baseDir; // Use the provided directory as-is
    } catch {
      // baseDir exists but doesn't have reports subdir yet - treat as a custom output root
      runDir = baseDir;
    }
  } else {
    // No baseDir provided - create new timestamped directory in default location
    const outputBase = path.join(process.cwd(), 'output');
    const timestamp = getTimestampedFolderName();

    // If inputFileName provided, include it in the folder name
    // Format: {inputFileName}-{timestamp} (e.g., "test-migration-2025-12-21-1545")
    const folderName = inputFileName ? `${inputFileName}-${timestamp}` : timestamp;
    runDir = path.join(outputBase, folderName);
  }

  // Create all subdirectories
  const reportsDir = path.join(runDir, 'reports');
  const screenshotsDir = path.join(runDir, 'screenshots');
  const dashboardsDir = path.join(runDir, 'dashboards');
  const lighthouseDir = path.join(runDir, 'lighthouse-reports');
  const axeDir = path.join(runDir, 'axe-reports');

  await fs.mkdir(reportsDir, { recursive: true });
  await fs.mkdir(screenshotsDir, { recursive: true });
  await fs.mkdir(dashboardsDir, { recursive: true });
  await fs.mkdir(lighthouseDir, { recursive: true });
  await fs.mkdir(axeDir, { recursive: true });

  return {
    runDir,
    reportsDir,
    screenshotsDir,
    dashboardsDir,
    lighthouseDir,
    axeDir,
  };
}

/**
 * Find the most recent timestamped output directory
 * Returns the full path to the most recent run, or null if none exist
 */
export async function findLatestOutputDir(baseDir?: string): Promise<string | null> {
  const outputBase = baseDir || path.join(process.cwd(), 'output');

  try {
    const entries = await fs.readdir(outputBase, { withFileTypes: true });

    // Filter for directories matching timestamp pattern (YYYY-MM-DD-HHmm)
    const timestampDirs = entries
      .filter(entry => entry.isDirectory())
      .filter(entry => /^\d{4}-\d{2}-\d{2}-\d{4}$/.test(entry.name))
      .map(entry => entry.name)
      .sort()
      .reverse();

    if (timestampDirs.length === 0) {
      return null;
    }

    return path.join(outputBase, timestampDirs[0]);
  } catch (error) {
    return null;
  }
}

/**
 * Get the latest run's reports directory
 */
export async function findLatestReportsDir(baseDir?: string): Promise<string | null> {
  const latestRun = await findLatestOutputDir(baseDir);
  return latestRun ? path.join(latestRun, 'reports') : null;
}

/**
 * Get the latest run's dashboards directory
 */
export async function findLatestDashboardsDir(baseDir?: string): Promise<string | null> {
  const latestRun = await findLatestOutputDir(baseDir);
  return latestRun ? path.join(latestRun, 'dashboards') : null;
}
