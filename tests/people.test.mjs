import test from 'node:test';
import assert from 'node:assert/strict';
import { profile, nameKey, groupPeople } from '../brain/people.js';

test('profiles', () => {
  assert.deepEqual(profile('https://www.twitter.com/Ada', 'Ada L (@Ada) / X'), { site: 'x', handle: 'Ada', name: 'Ada L' });
  assert.equal(profile('https://x.com/Home', 'x'), null);
  assert.equal(profile('https://x.com/a/b', 'x'), null);
  assert.equal(profile('nope', 'x'), null);
  assert.deepEqual(profile('https://linkedin.com/in/ada/', 'Ada L - Eng | LinkedIn'), { site: 'linkedin', handle: 'ada', name: 'Ada L' });
  assert.equal(profile('https://linkedin.com/in/ada', 'Ada | Foo').name, null);
  assert.equal(profile('https://m.linkedin.com/in/ada', 'Ada | LinkedIn').name, 'Ada');
  assert.equal(profile('https://github.com/ada', 'ada (Ada L) · GitHub').name, 'Ada L');
  assert.equal(profile('https://github.com/orgs', 'x'), null);
  assert.equal(profile('https://scholar.google.com/citations?user=abc', 'Ada - Google Scholar').name, 'Ada');
  assert.equal(profile('https://scholar.google.com/citations?user=', 'a'), null);
  assert.equal(profile('https://scholar.google.com/citations', 'a'), null);
});

test('nameKey', () => {
  assert.equal(nameKey('José  Ramírez-Ortiz'), 'jose ramirez ortiz');
});

test('groupPeople', () => {
  const g = groupPeople([
    { url: 'https://x.com/ada', title: 'Ada L (@ada) / X' },
    { url: 'https://example.com', title: 'z' },
    { url: 'https://github.com/Bob', title: 'Bob (Bob B) · GitHub' },
    { url: 'https://linkedin.com/in/al', title: 'ada l | LinkedIn' },
    { url: 'https://github.com/BOB', title: 'BOB' },
    { url: 'https://github.com/ada', title: 'ada (Ada  L) · GitHub' },
    { url: 'https://github.com/zed', title: 'zed' },
  ]);
  assert.deepEqual(g, [
    { name: 'Ada L', pages: [0, 3, 5] },
    { name: 'Bob B', pages: [2, 4] },
    { name: '@zed', pages: [6] },
  ]);
});
