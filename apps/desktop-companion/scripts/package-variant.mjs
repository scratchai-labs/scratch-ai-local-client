import { execFileSync } from 'node:child_process';
import path from 'node:path';

export const DEFAULT_PACKAGED_DEEPSEEK_API_KEY = 'PLEASE_FILL_DEEPSEEK_API_KEY';
export const PACKAGED_KEY_MODE_ENV_NAME = 'SCRATCH_AI_PACKAGED_KEY_MODE';
export const PACKAGED_API_KEY_ENV_NAME = 'SCRATCH_AI_PACKAGED_DEEPSEEK_API_KEY';

const PLACEHOLDER_API_KEYS = new Set([
  '',
  DEFAULT_PACKAGED_DEEPSEEK_API_KEY,
  'YOUR_DEEPSEEK_API_KEY'
]);

const VALID_PACKAGE_VARIANTS = new Set(['source', 'with-key', 'no-key']);

function normalizeApiKey(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isConfiguredApiKey(value) {
  const candidate = normalizeApiKey(value);
  return Boolean(candidate) && !PLACEHOLDER_API_KEYS.has(candidate);
}

function sanitizePackagedDeepSeekConfig(sourceConfig) {
  return {
    ...sourceConfig,
    apiKey: DEFAULT_PACKAGED_DEEPSEEK_API_KEY
  };
}

export function validatePackageVariant(variant) {
  if (!VALID_PACKAGE_VARIANTS.has(variant)) {
    throw new Error(`Unsupported package variant "${variant}". Expected one of: source, with-key, no-key.`);
  }

  return variant;
}

export function parsePackageVariantArg(argv, defaultVariant = 'source') {
  const rawArg = argv.find((arg) => arg.startsWith('--variant='));
  const variant = rawArg ? rawArg.slice('--variant='.length).trim() : defaultVariant;
  return validatePackageVariant(variant);
}

export function hasCliFlag(argv, flag) {
  return argv.includes(flag);
}

export function getPackageVariantMeta(variant) {
  if (variant === 'with-key') {
    return {
      variant,
      displayName: 'with-key variant name',
      outputDirSuffix: '-with-key',
      artifactBaseName: 'ScratchDesktopCompanion-with-key',
      packagedKeyMode: 'with-key'
    };
  }

  if (variant === 'no-key') {
    return {
      variant,
      displayName: 'no-key variant name',
      outputDirSuffix: '-no-key',
      artifactBaseName: 'ScratchDesktopCompanion-no-key',
      packagedKeyMode: 'no-key'
    };
  }

  return {
    variant: 'source',
    displayName: 'source variant name',
    outputDirSuffix: '',
    artifactBaseName: 'ScratchDesktopCompanion',
    packagedKeyMode: 'source'
  };
}

export function resolvePackagedDeepSeekConfig(sourceConfig, env = process.env) {
  const packagedKeyMode = validatePackageVariant((env[PACKAGED_KEY_MODE_ENV_NAME] ?? 'source').trim() || 'source');

  return {
    mode: packagedKeyMode,
    configured: false,
    config: sanitizePackagedDeepSeekConfig(sourceConfig)
  };
}

export function runBuildForVariant(appDir, variant) {
  const variantMeta = getPackageVariantMeta(variant);

  execFileSync(process.execPath, [path.join(appDir, 'build.mjs')], {
    cwd: appDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      [PACKAGED_KEY_MODE_ENV_NAME]: variantMeta.packagedKeyMode
    }
  });
}
