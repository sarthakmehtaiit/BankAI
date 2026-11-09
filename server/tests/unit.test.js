// Unit tests for the pure logic. No database or AI needed. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatRupees, paiseToRupeeText, toPaise } from '../src/utils/money.js';
import { maskAccountNumber, maskPan, maskSensitive } from '../src/utils/mask.js';
import { editDistance, normalizeName, similarity } from '../src/utils/text.js';
import { checkKyc, isValidDob, isValidPan } from '../src/services/kyc.js';
import { checkFraud, countInWindow, lowerBound } from '../src/services/fraud.js';
import { ruleCategory } from '../src/services/categorize.js';

const MIN = 60 * 1000;

test('money: rupees are converted to paise without floating point errors', () => {
  assert.equal(toPaise('500'), 50000);
  assert.equal(toPaise('499.5'), 49950);
  assert.equal(toPaise('0.29'), 29); // 0.29 * 100 = 28.999999999999996 with floats
  assert.equal(paiseToRupeeText(49950), '499.50');
  assert.equal(formatRupees(10000000), '₹1,00,000.00');
  for (const bad of ['-5', 'abc', '1.234', '', '1e5']) assert.throws(() => toPaise(bad));
});

test('masking hides PAN, Aadhaar and account numbers', () => {
  assert.equal(maskAccountNumber('501000000001'), 'XXXX0001');
  assert.equal(maskPan('ABCPN1234K'), 'ABCPN****K');
  const text = maskSensitive('PAN ABCPN1234K, Aadhaar 1234 5678 9012, account 501000000001');
  assert.ok(!text.includes('ABCPN1234K'));
  assert.ok(!text.includes('1234 5678 9012'));
  assert.ok(text.includes('XXXX0001'));
});

test('edit distance and name similarity', () => {
  assert.equal(editDistance('MEHTA', 'METHA'), 2);
  assert.equal(editDistance('', 'ABC'), 3);
  assert.equal(normalizeName('  priya   nair. '), 'PRIYA NAIR');
  assert.equal(similarity('PRIYA NAIR', 'PRIYA NAIR'), 1);
  assert.ok(similarity('PRIYA NAIR', 'PRIYA NAYAR') > 0.8);
});

test('KYC: PAN format and date of birth validation', () => {
  assert.ok(isValidPan('ABCPN1234K'));
  assert.ok(!isValidPan('ABCP1234K'));
  assert.ok(!isValidPan('abcpn1234k'));
  assert.ok(isValidDob('2002-03-14'));
  assert.ok(!isValidDob('2002-02-30'));
  assert.ok(!isValidDob('2999-01-01'));
});

const entered = { name: 'Priya Nair', dob: '2002-03-14', pan: 'ABCPN1234K' };
const card = { isPanCard: true, readable: true, name: 'PRIYA NAIR', dob: '2002-03-14', pan: 'ABCPN1234K' };

test('KYC: everything matches -> verified (capitals and spaces do not matter)', () => {
  const result = checkKyc({ entered: { ...entered, name: '  priya  NAIR ' }, extracted: card, panUsedByOtherUser: false });
  assert.equal(result.status, 'verified');
});

test('KYC: small differences go to a human, big ones are rejected', () => {
  assert.equal(checkKyc({ entered, extracted: { ...card, dob: '2002-03-15' }, panUsedByOtherUser: false }).status, 'needs_review');
  assert.equal(checkKyc({ entered, extracted: { ...card, pan: 'ABCPN1284K' }, panUsedByOtherUser: false }).status, 'needs_review');
  assert.equal(checkKyc({ entered, extracted: { ...card, name: 'RAHUL VERMA' }, panUsedByOtherUser: false }).status, 'rejected');
  assert.equal(checkKyc({ entered, extracted: { ...card, isPanCard: false }, panUsedByOtherUser: false }).status, 'rejected');
});

test('KYC: duplicate PAN is rejected, and no AI means manual review', () => {
  assert.equal(checkKyc({ entered, extracted: card, panUsedByOtherUser: true }).status, 'rejected');
  assert.equal(checkKyc({ entered, extracted: null, panUsedByOtherUser: false }).status, 'needs_review');
});

test('fraud: binary search and sliding window count', () => {
  const times = [10, 20, 30, 40, 50];
  assert.equal(lowerBound(times, 30), 2);
  assert.equal(lowerBound(times, 35), 3);
  assert.equal(lowerBound(times, 99), 5);
  assert.equal(countInWindow(times, 50, 25), 3); // 30, 40, 50 are inside the window [25, 50]
});

const now = Date.now();
const normalHistory = { pastAmounts: [50000, 60000, 40000, 55000, 45000], recentTimestamps: [now - 5 * 24 * 60 * MIN] };

test('fraud: a normal payment is not flagged', () => {
  assert.equal(checkFraud({ amountPaise: 60000, ...normalHistory, now }).flagged, false);
});

test('fraud: amount more than 3x the average is flagged', () => {
  const result = checkFraud({ amountPaise: 200000, ...normalHistory, now });
  assert.deepEqual(result.reasons.map((r) => r.code), ['LARGE_AMOUNT']);
});

test('fraud: more than 5 payments in 10 minutes is flagged', () => {
  const recent = [now - 9 * MIN, now - 7 * MIN, now - 5 * MIN, now - 3 * MIN, now - 1 * MIN];
  const result = checkFraud({ amountPaise: 10000, pastAmounts: [], recentTimestamps: recent, now });
  assert.deepEqual(result.reasons.map((r) => r.code), ['TOO_FAST']);
  // The same 5 payments an hour ago do not count: they slid out of the window.
  const old = recent.map((t) => t - 60 * MIN);
  assert.equal(checkFraud({ amountPaise: 10000, pastAmounts: [], recentTimestamps: old, now }).flagged, false);
});

test('fraud: big payment to a payee added today is flagged', () => {
  const result = checkFraud({ amountPaise: 15_000_00, pastAmounts: [], recentTimestamps: [], payeeAddedAt: now - 2 * 60 * MIN, now });
  assert.deepEqual(result.reasons.map((r) => r.code), ['NEW_PAYEE_LARGE']);
});

test('categories: keyword rules use whole words', () => {
  assert.equal(ruleCategory('Swiggy'), 'Food');
  assert.equal(ruleCategory('Swiggy Instamart'), 'Groceries');
  assert.equal(ruleCategory('Uber Trip'), 'Travel');
  assert.equal(ruleCategory('Coca Cola Store'), null); // "ola" inside "Cola" must not match
});
