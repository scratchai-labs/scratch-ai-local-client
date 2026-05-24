import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PACKAGED_DEEPSEEK_API_KEY,
  PACKAGED_API_KEY_ENV_NAME,
  PACKAGED_KEY_MODE_ENV_NAME,
  parsePackageVariantArg,
  resolvePackagedDeepSeekConfig
} from '../scripts/package-variant.mjs';

test('parsePackageVariantArg defaults to source', () => {
  assert.equal(parsePackageVariantArg(['node', 'script.mjs']), 'source');
});

test('resolvePackagedDeepSeekConfig forces placeholder key for no-key builds', () => {
  const resolved = resolvePackagedDeepSeekConfig(
    {
      apiKey: 'sk-source-demo',
      model: 'deepseek-v4-flash'
    },
    {
      [PACKAGED_KEY_MODE_ENV_NAME]: 'no-key'
    }
  );

  assert.equal(resolved.mode, 'no-key');
  assert.equal(resolved.configured, false);
  assert.equal(resolved.config.apiKey, DEFAULT_PACKAGED_DEEPSEEK_API_KEY);
  assert.equal(resolved.config.model, 'deepseek-v4-flash');
});

test('resolvePackagedDeepSeekConfig strips packaged keys even for with-key builds', () => {
  const resolved = resolvePackagedDeepSeekConfig(
    {
      apiKey: 'sk-source-demo',
      model: 'deepseek-v4-pro'
    },
    {
      [PACKAGED_KEY_MODE_ENV_NAME]: 'with-key',
      [PACKAGED_API_KEY_ENV_NAME]: '  sk-env-demo  '
    }
  );

  assert.equal(resolved.mode, 'with-key');
  assert.equal(resolved.configured, false);
  assert.equal(resolved.config.apiKey, DEFAULT_PACKAGED_DEEPSEEK_API_KEY);
  assert.equal(resolved.config.model, 'deepseek-v4-pro');
});

test('resolvePackagedDeepSeekConfig strips packaged keys for source builds too', () => {
  const resolved = resolvePackagedDeepSeekConfig(
    {
      apiKey: 'sk-source-demo',
      model: 'deepseek-v4-flash',
      timeoutMs: 20000
    },
    {}
  );

  assert.equal(resolved.mode, 'source');
  assert.equal(resolved.configured, false);
  assert.equal(resolved.config.apiKey, DEFAULT_PACKAGED_DEEPSEEK_API_KEY);
  assert.equal(resolved.config.timeoutMs, 20000);
});
