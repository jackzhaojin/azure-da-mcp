/**
 * Utility functions for managing output directories
 */

import path from 'path';
import fs from 'fs/promises';

/**
 * Create output directory structure
 *
 * If baseDir is provided and appears to be a run directory already, uses it as-is.
 * Otherwise, creates a new directory with the given folderName.
 *
 * @param baseDir - Optional base directory. If provided and initialized, used as-is
 * @param folderName - Folder name to use (e.g., "test-migration-2025-12-21-1545")
 *
 * Returns: { runDir, reportsDir, screenshotsDir, dashboardsDir, lighthouseDir, axeDir }
 */
export async function createOutputDirs(
  baseDir?: string,
  folderName?: string
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
  // This handles the case where a batch creates a dir and passes it to individual evaluations
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
    // No baseDir provided - create directory with folderName or fall back to 'default'
    const outputBase = path.join(process.cwd(), 'output');
    const dirName = folderName || 'default';
    runDir = path.join(outputBase, dirName);
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
 * Find the most recent output directory (alphabetically sorted)
 * Returns the full path to the most recent run, or null if none exist
 */
export async function findLatestOutputDir(baseDir?: string): Promise<string | null> {
  const outputBase = baseDir || path.join(process.cwd(), 'output');

  try {
    const entries = await fs.readdir(outputBase, { withFileTypes: true });

    // Filter for directories (excluding hidden/archive folders)
    const dirs = entries
      .filter(entry => entry.isDirectory())
      .filter(entry => !entry.name.startsWith('.') && !entry.name.includes('before'))
      .map(entry => entry.name)
      .sort()
      .reverse();

    if (dirs.length === 0) {
      return null;
    }

    return path.join(outputBase, dirs[0]);
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
