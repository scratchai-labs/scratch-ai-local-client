import path from 'node:path';
import { copyFile, cp, lstat, mkdir, rm } from 'node:fs/promises';

const RETRYABLE_COPY_ERROR_CODES = new Set(['EBUSY', 'EPERM', 'EACCES']);
const WINDOWS_DIRECTORY_COPY_FALLBACK_ERROR_CODES = new Set(['EPERM', 'EINVAL']);

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function copyFileWithRetry(sourcePath, targetPath, options = {}) {
  const attempts = options.attempts ?? 10;
  const delayMs = options.delayMs ?? 1500;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await copyFile(sourcePath, targetPath);
      return;
    } catch (error) {
      const errorCode = error && typeof error === 'object' ? error.code : undefined;
      const canRetry = RETRYABLE_COPY_ERROR_CODES.has(String(errorCode));
      if (!canRetry || attempt >= attempts) {
        throw error;
      }

      await delay(delayMs * attempt);
    }
  }
}

export async function copyPathWithRetry(sourcePath, targetPath, options = {}) {
  const attempts = options.attempts ?? 10;
  const delayMs = options.delayMs ?? 1500;
  const platform = options.platform ?? process.platform;
  const lstatImpl = options.lstatImpl ?? lstat;
  const mkdirImpl = options.mkdirImpl ?? mkdir;
  const rmImpl = options.rmImpl ?? rm;
  const cpImpl = options.cpImpl ?? cp;
  const copyFileImpl = options.copyFileImpl ?? copyFile;
  const sourceStats = await lstatImpl(sourcePath);

  async function copyDirectory(preserveTimestamps) {
    await rmImpl(targetPath, { recursive: true, force: true });
    await cpImpl(sourcePath, targetPath, {
      recursive: true,
      force: true,
      preserveTimestamps,
      verbatimSymlinks: true
    });
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await mkdirImpl(path.dirname(targetPath), { recursive: true });

      if (sourceStats.isDirectory()) {
        try {
          await copyDirectory(true);
        } catch (error) {
          const errorCode = error && typeof error === 'object' ? error.code : undefined;
          const shouldRetryWithoutTimestamps =
            platform === 'win32' && WINDOWS_DIRECTORY_COPY_FALLBACK_ERROR_CODES.has(String(errorCode));

          if (!shouldRetryWithoutTimestamps) {
            throw error;
          }

          await copyDirectory(false);
        }
      } else {
        await copyFileImpl(sourcePath, targetPath);
      }
      return;
    } catch (error) {
      const errorCode = error && typeof error === 'object' ? error.code : undefined;
      const canRetry = RETRYABLE_COPY_ERROR_CODES.has(String(errorCode));
      if (!canRetry || attempt >= attempts) {
        throw error;
      }

      await delay(delayMs * attempt);
    }
  }
}
