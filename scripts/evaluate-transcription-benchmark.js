#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { scoreTranscriptionBenchmark } = require('../lib/transcription-benchmark');

function printHelp() {
  process.stdout.write([
    'نَبراس · تقييم تفريغ القراءة العربية',
    '',
    'Usage:',
    '  node scripts/evaluate-transcription-benchmark.js --input <json-or-jsonl> [--output <report.json>]',
    '',
    'The input must contain anonymized records with id, grade, mode, model, referenceText, and transcriptText.',
    'Optional expertAnnotations enables precision/recall/F1 evaluation against human-reviewed word-error labels.',
    'No audio files are required or read by this tool.'
  ].join('\n') + '\n');
}

function parseArgs(argv) {
  const args = { input: null, output: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (value === '--help' || value === '-h') {
      args.help = true;
    } else if (value === '--input' || value === '-i') {
      args.input = argv[++i] || null;
    } else if (value === '--output' || value === '-o') {
      args.output = argv[++i] || null;
    } else {
      throw new TypeError('وسيط غير معروف: ' + value);
    }
  }
  return args;
}

function parseInput(text) {
  const trimmed = String(text || '').replace(/^\uFEFF/, '').trim();
  if (!trimmed) throw new TypeError('ملف الإدخال فارغ.');

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.records)) return parsed.records;
    if (parsed && typeof parsed === 'object') return [parsed];
    throw new TypeError('ملف JSON يجب أن يكون مصفوفة أو كائنًا يحتوي على records أو سجلًا واحدًا.');
  } catch (error) {
    const lines = trimmed.split(/\r?\n/).filter(Boolean);
    if (error instanceof TypeError && /ملف JSON يجب/.test(error.message)) throw error;
    if (lines.length <= 1) throw error;
    return lines.map((line, index) => {
      try { return JSON.parse(line); }
      catch (_) { throw new TypeError('تعذر تحليل السطر ' + (index + 1) + ' من JSONL.'); }
    });
  }
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.input) throw new TypeError('يجب تحديد ملف الإدخال عبر --input.');
  const inputPath = path.resolve(process.cwd(), args.input);
  const inputText = fs.readFileSync(inputPath, 'utf8');
  const records = parseInput(inputText);
  const report = scoreTranscriptionBenchmark(records);
  const output = JSON.stringify(report, null, 2) + '\n';

  if (args.output) {
    const outputPath = path.resolve(process.cwd(), args.output);
    fs.writeFileSync(outputPath, output, { encoding: 'utf8', mode: 0o600 });
    try { fs.chmodSync(outputPath, 0o600); } catch (_) {}
    process.stdout.write('تم حفظ تقرير التقييم في: ' + outputPath + '\n');
  } else {
    process.stdout.write(output);
  }
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write('فشل تقييم التفريغ: ' + (error && error.message ? error.message : 'خطأ غير معروف') + '\n');
    process.exitCode = 1;
  }
}

module.exports = { parseArgs, parseInput, main };
