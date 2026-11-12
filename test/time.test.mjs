import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatLocal } from '../app/time.js';

const at = '2026-11-12T03:03:00.000Z';

test('Berlin viewer, German locale: own zone, day before month', () => {
  assert.equal(formatLocal(at, { locale: 'de-DE', timeZone: 'Europe/Berlin' }), '12.11., 04:03');
});
test('Auckland viewer, NZ English: own zone (16:03 NZDT), dd/mm', () => {
  assert.equal(formatLocal(at, { locale: 'en-NZ', timeZone: 'Pacific/Auckland' }), '12/11, 04:03 pm');
});
test('London viewer, en-GB: dd/mm', () => {
  assert.equal(formatLocal(at, { locale: 'en-GB', timeZone: 'Europe/London' }), '12/11, 03:03');
});
test('US viewer keeps month first', () => {
  assert.equal(formatLocal(at, { locale: 'en-US', timeZone: 'America/New_York' }), '11/11, 10:03 PM');
});
test('bad input falls back to the raw value', () => {
  assert.equal(formatLocal('nope'), 'nope');
});
