'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArgs, parseInput } = require('../scripts/evaluate-transcription-benchmark');

test('parses input and output arguments without executing the CLI on import', () => {
  assert.deepEqual(parseArgs(['--input', 'samples.json', '--output', 'report.json']), {
    input: 'samples.json',
    output: 'report.json',
    help: false
  });
  assert.equal(parseArgs(['--help']).help, true);
  assert.throws(() => parseArgs(['--unknown']), /وسيط غير معروف/);
});

test('parses JSON arrays, JSON records wrappers, and JSONL benchmark files', () => {
  const first = { id: 'anon-1', grade: 1 };
  const second = { id: 'anon-2', grade: 2 };
  assert.deepEqual(parseInput(JSON.stringify([first, second])), [first, second]);
  assert.deepEqual(parseInput(JSON.stringify({ records: [first, second] })), [first, second]);
  assert.deepEqual(parseInput(JSON.stringify(first) + '\n' + JSON.stringify(second)), [first, second]);
});

test('rejects empty input and invalid JSONL with a useful row number', () => {
  assert.throws(() => parseInput('  '), /فارغ/);
  assert.throws(() => parseInput('{"id":"ok"}\nnot-json'), /السطر 2/);
});
