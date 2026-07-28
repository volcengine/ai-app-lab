import test from 'node:test';
import assert from 'node:assert/strict';
import { redact } from '../../src/server/logger.js';

test('redacts Ark and bearer credentials from structured logs', () => {
  const arkKey = ['ark', '12345678', 'abcd', 'efgh'].join('-');
  const bearer = ['Bearer', 'header.payload.signature'].join(' ');
  const output = redact({ arkKey, bearer });
  assert.equal(output.includes(arkKey), false);
  assert.equal(output.includes('header.payload.signature'), false);
  assert.match(output, /\[REDACTED\]/);
});
