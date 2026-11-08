import test from 'node:test';
import assert from 'node:assert/strict';
import { canonical, duplicateGroups } from '../brain/urls.js';

test('table', () => {
  const t = {
    'HTTP://WWW.Example.com': 'https://example.com/',
    'https://example.com/Docs/?utm_source=x&b=2&a=1#intro': 'https://example.com/Docs?a=1&b=2',
    'https://arxiv.org/pdf/2503.01840v2': 'https://arxiv.org/abs/2503.01840',
    'https://arxiv.org/pdf/2503.01840v2.pdf': 'https://arxiv.org/abs/2503.01840',
    'https://youtu.be/abc123?si=XYZ&t=30': 'https://youtube.com/watch?t=30&v=abc123',
    'https://mail.google.com/mail/u/0/#inbox': 'https://mail.google.com/mail/u/0',
    'https://app.example.com/#/settings': 'https://app.example.com/#/settings',
    'http://localhost:8765/x/': 'https://localhost:8765/x',
    'http://x.com:443/': 'https://x.com/',
    'https://x.com:80/': 'https://x.com/',
    'https://twitter.com/a': 'https://x.com/a',
    'https://en.m.wikipedia.org/': 'https://en.m.wikipedia.org/',
    ' about:blank ': 'about:blank',
    'not a url': 'not a url',
  };
  for (const [i, o] of Object.entries(t)) assert.equal(canonical(i), o);
});

test('groups', () => {
  assert.deepEqual(duplicateGroups([]), []);
  assert.deepEqual(
    duplicateGroups(['http://a.com/', 'x:y', 'https://www.a.com', 'x:y', 'https://b.com']),
    [[0, 2], [1, 3]],
  );
});
