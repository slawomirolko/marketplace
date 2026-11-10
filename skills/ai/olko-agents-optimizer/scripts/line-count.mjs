#!/usr/bin/env node

/**
 * Context-file, agent-prompt and SKILL.md statistics for olko-agents-optimizer.
 * Usage: node line-count.mjs <path> [--registry <registry.json>]
 * Output: JSON with lines, words, estimated tokens, sections, allowed skills, and prefix-stability issues.
 * Exit codes: 0 = success, 1 = error
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const filePath = args.find((arg, index) => !arg.startsWith('--') && args[index - 1] !== '--registry');
const registryIndex = args.indexOf('--registry');
const registryPath = registryIndex >= 0 ? args[registryIndex + 1] : undefined;

function fail(message) {
  console.error(JSON.stringify({ error: message, usage: 'node line-count.mjs <path> [--registry <registry.json>]' }));
  process.exit(1);
}

if (!filePath) {
  fail('No file path provided');
}

const resolvedPath = resolve(filePath);
if (!existsSync(resolvedPath)) {
  fail(`File not found: ${resolvedPath}`);
}

let content;
try {
  content = readFileSync(resolvedPath, 'utf8').replace(/^﻿/, '');
} catch (err) {
  fail(`Cannot read file: ${err.message}`);
}

const estimateTokens = (text) => Math.ceil(text.length / 4);
const countWords = (text) => (text.match(/\S+/g) ?? []).length;

const lines = content.split(/\r?\n/);
let frontmatterLines = [];
let bodyStart = 0;
if (lines[0] === '---') {
  const end = lines.indexOf('---', 1);
  if (end > 0) {
    frontmatterLines = lines.slice(1, end);
    bodyStart = end + 1;
  }
}

function detectType() {
  const keys = new Set(frontmatterLines.map((line) => line.match(/^([A-Za-z_]+):/)?.[1]).filter(Boolean));
  if (keys.has('mode') || keys.has('permission')) return 'agent';
  if (keys.has('name') && keys.has('description')) return 'skill';
  return 'context';
}

function allowedSkills() {
  const skills = [];
  let inSkillBlock = false;
  for (const line of frontmatterLines) {
    if (/^ {2}skill:\s*$/.test(line)) {
      inSkillBlock = true;
      continue;
    }
    if (inSkillBlock && /^ {0,2}\S/.test(line)) break;
    const match = inSkillBlock && line.match(/^ {4}"?([a-z0-9][a-z0-9-]*)"?:\s*allow\s*$/);
    if (match) skills.push(match[1]);
  }
  return skills;
}

const type = detectType();
const headingPattern = /^(#{2,6})\s+(.+)$/;
const agentSectionPattern = /^(?:\d+[a-z]?\.\s+\S|[A-Z][A-Z0-9 /&'()-]{3,}(?:\s+—\s+[^:]+)?:)/;

const sections = [];
let currentSection = null;
let inCodeBlock = false;
let codeBlockLines = 0;
let tableLines = 0;

function closeSection(endLine) {
  if (!currentSection) return;
  const text = lines.slice(currentSection.startLine - 1, endLine).join('\n');
  currentSection.endLine = endLine;
  currentSection.lines = endLine - currentSection.startLine + 1;
  currentSection.words = countWords(text);
  currentSection.estimatedTokens = estimateTokens(text);
  sections.push(currentSection);
}

for (let i = bodyStart; i < lines.length; i++) {
  const line = lines[i];

  if (line.trimStart().startsWith('```')) {
    inCodeBlock = !inCodeBlock;
    codeBlockLines++;
    if (currentSection) currentSection.codeBlockLines++;
    continue;
  }
  if (inCodeBlock) {
    codeBlockLines++;
    if (currentSection) currentSection.codeBlockLines++;
    continue;
  }
  if (/^\s*\|.*\|/.test(line)) {
    tableLines++;
    if (currentSection) currentSection.tableLines++;
    continue;
  }

  const headingMatch = line.match(headingPattern);
  const agentLabel = type === 'agent' && !headingMatch && agentSectionPattern.test(line);
  if (headingMatch || agentLabel) {
    closeSection(i);
    currentSection = {
      heading: headingMatch ? headingMatch[2].trim() : line.slice(0, 80).trim(),
      level: headingMatch ? headingMatch[1].length : 2,
      startLine: i + 1,
      endLine: null,
      lines: 0,
      words: 0,
      estimatedTokens: 0,
      codeBlockLines: 0,
      tableLines: 0
    };
  }
}
closeSection(lines.length);

const prefixRules = [
  { id: 'date', pattern: /\b20\d{2}-\d{2}-\d{2}\b/ },
  { id: 'relative-time', pattern: /\b(today|yesterday|tomorrow|this week|right now)\b/i },
  { id: 'absolute-path', pattern: /(?:\b[A-Za-z]:[\\/](?:Users|Projects|home)\b|\/Users\/|\/home\/)/ },
  { id: 'session-reference', pattern: /\b(this session|current session|session id)\b/i },
  { id: 'version-literal', pattern: /\bv?\d+\.\d+\.\d+\b/ }
];

const prefixIssues = [];
let inFence = false;
for (let i = 0; i < lines.length; i++) {
  if (/^\s*```/.test(lines[i])) {
    inFence = !inFence;
    continue;
  }
  if (inFence) continue;
  for (const rule of prefixRules) {
    const match = lines[i].match(rule.pattern);
    if (match) prefixIssues.push({ line: i + 1, rule: rule.id, text: match[0] });
  }
}

const skills = type === 'agent' ? allowedSkills() : [];
let skillDescriptions;
if (registryPath && skills.length > 0) {
  try {
    const registry = JSON.parse(readFileSync(resolve(registryPath), 'utf8'));
    const byName = new Map(registry.skills.map((skill) => [skill.name, skill.description ?? '']));
    skillDescriptions = skills.map((name) => ({ name, chars: byName.has(name) ? byName.get(name).length : null }));
  } catch (err) {
    fail(`Cannot read registry: ${err.message}`);
  }
}

const result = {
  file: resolvedPath,
  type,
  totalLines: lines.length,
  nonEmptyLines: lines.filter((line) => line.trim().length > 0).length,
  words: countWords(lines.slice(bodyStart).join('\n')),
  estimatedTokens: estimateTokens(content),
  codeBlockLines,
  tableLines,
  sectionCount: sections.length,
  sections,
  allowedSkills: skills,
  ...(skillDescriptions
    ? {
        skillDescriptions,
        skillDescriptionChars: skillDescriptions.reduce((sum, skill) => sum + (skill.chars ?? 0), 0)
      }
    : {}),
  prefixIssues
};

console.log(JSON.stringify(result, null, 2));
