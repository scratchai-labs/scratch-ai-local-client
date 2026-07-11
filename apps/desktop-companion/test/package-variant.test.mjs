import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PACKAGED_DEEPSEEK_API_KEY,
  PACKAGED_KEY_MODE_ENV_NAME,
  parsePackageVariantArg,
  validatePackageVariant,
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

test('package variants reject with-key builds to avoid packaged secrets', () => {
  assert.throws(
    () => validatePackageVariant('with-key'),
    /Unsupported package variant "with-key"/
  );
  assert.throws(
    () => parsePackageVariantArg(['node', 'script.mjs', '--variant=with-key']),
    /Unsupported package variant "with-key"/
  );
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
