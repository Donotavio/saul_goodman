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
  assert.ok(safe.includes('safe.example.com'));
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
