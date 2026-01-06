import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const blogModulePath = pathToFileURL(path.join(process.cwd(), 'site', 'blog', 'blog.js')).href;

const loadBlogModule = () => import(blogModulePath);

test('sanitizeLinkHref blocks javascript: and allows safe protocols', async () => {
  const { sanitizeLinkHref } = await loadBlogModule();
  assert.equal(sanitizeLinkHref('javascript:alert(1)'), null);
  assert.equal(sanitizeLinkHref('data:text/html,hi'), null);
  assert.equal(sanitizeLinkHref('//evil.com'), null);
  assert.ok((sanitizeLinkHref('https://example.com') || '').startsWith('https://example.com'));
  assert.ok((sanitizeLinkHref('mailto:test@example.com') || '').startsWith('mailto:test@example.com'));
});

test('inlineMarkdown strips unsafe links', async () => {
  const { inlineMarkdown } = await loadBlogModule();
  const safe = inlineMarkdown('[ok](https://safe.example.com)');
  const safeHrefMatch = safe.match(/href="([^"]+)"/);
  assert.ok(safeHrefMatch, 'Expected an anchor tag with an href attribute in safe output');
  const safeUrl = new URL(safeHrefMatch[1], 'https://example.test');
  assert.equal(safeUrl.protocol, 'https:');
  assert.equal(safeUrl.host, 'safe.example.com');
  const blocked = inlineMarkdown('[bad](javascript:alert(1))');
  assert.equal(blocked.includes('<a'), false);
  assert.ok(/bad/.test(blocked));
});

test('buildPostLink rejects unsafe external URLs', async () => {
  const { buildPostLink } = await loadBlogModule();
  const fromMarkdown = buildPostLink({ markdown: '2025/test-post.md' });
  assert.ok(/posts\/2025\/test-post\/$/.test(new URL(fromMarkdown).pathname));
  const safeExternal = buildPostLink({ url: 'https://example.com/post' });
  assert.equal(safeExternal, 'https://example.com/post');
  const blocked = buildPostLink({ url: 'javascript:alert(1)' });
  assert.equal(blocked, '#');
});

test('parseFrontmatter supports multiline values', async () => {
  const { parseFrontmatter } = await loadBlogModule();
  const source = `---
title: Post de Teste
excerpt: |
  Primeira linha
  Segunda linha
tags: [foo, bar]
---
Corpo`;
  const { data, body } = parseFrontmatter(source);
  assert.equal(data.title, 'Post de Teste');
  assert.equal(data.tags?.length, 2);
  assert.equal(data.excerpt, 'Primeira linha\nSegunda linha');
  assert.equal(body, 'Corpo');
});

test('getLocalizedTags prefers language-specific tags', async () => {
  const { getLocalizedTags } = await loadBlogModule();
  const meta = { tags: ['padrão'], tags_en: ['english'], tags_es: 'espanol, outro' };
  assert.deepEqual(getLocalizedTags(meta, 'en'), ['english']);
  assert.deepEqual(getLocalizedTags(meta, 'es'), ['espanol', 'outro']);
  assert.deepEqual(getLocalizedTags(meta, 'pt'), ['padrão']);
});

test('getLocalizedTags translates base tags when no localized list exists', async () => {
  const { getLocalizedTags } = await loadBlogModule();
  const meta = { tags: ['produtividade', 'procrastinação', 'AI'] };
  assert.deepEqual(getLocalizedTags(meta, 'en'), ['Productivity', 'Procrastination', 'AI']);
  assert.deepEqual(getLocalizedTags(meta, 'es'), ['Productividad', 'Procrastinación', 'AI']);
});
