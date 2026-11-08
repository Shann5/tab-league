import test from "node:test";
import assert from "node:assert/strict";
import { canonical, duplicateGroups } from "../brain/urls.js";

test("spec examples", () => {
  assert.equal(canonical("HTTP://WWW.Example.com"), "https://example.com/");
  assert.equal(canonical("https://example.com/Docs/?utm_source=x&b=2&a=1#intro"), "https://example.com/Docs?a=1&b=2");
  assert.equal(canonical("https://arxiv.org/pdf/2503.01840v2"), "https://arxiv.org/abs/2503.01840");
  assert.equal(canonical("https://youtu.be/abc123?si=XYZ&t=30"), "https://youtube.com/watch?t=30&v=abc123");
  assert.equal(canonical("https://mail.google.com/mail/u/0/#inbox"), "https://mail.google.com/mail/u/0");
  assert.equal(canonical("https://app.example.com/#/settings"), "https://app.example.com/#/settings");
});

test("non-http URLs and unparseable strings come back trimmed and unchanged", () => {
  assert.equal(canonical("chrome://newtab/"), "chrome://newtab/");
  assert.equal(canonical("  about:blank "), "about:blank");
  assert.equal(canonical("file:///Users/x/Paper.pdf"), "file:///Users/x/Paper.pdf");
  assert.equal(canonical("mailto:a@b.c"), "mailto:a@b.c");
  assert.equal(canonical("  not a url  "), "not a url");
});

test("http becomes https and surrounding whitespace is trimmed", () => {
  assert.equal(canonical("  http://example.com/a  "), "https://example.com/a");
});

test("one leading www. or m. is removed, other subdomains stay", () => {
  assert.equal(canonical("https://m.youtube.com/watch?v=1"), "https://youtube.com/watch?v=1");
  assert.equal(canonical("https://en.m.wikipedia.org/wiki/X"), "https://en.m.wikipedia.org/wiki/X");
  assert.equal(canonical("https://www.www.example.com/"), "https://www.example.com/");
  assert.equal(canonical("https://docs.example.com/"), "https://docs.example.com/");
});

test("ports 80 and 443 are dropped, others kept; credentials dropped", () => {
  assert.equal(canonical("http://example.com:80/x"), "https://example.com/x");
  assert.equal(canonical("http://example.com:443/x"), "https://example.com/x");
  assert.equal(canonical("http://localhost:8765/graph.html"), "https://localhost:8765/graph.html");
  assert.equal(canonical("https://user:pw@example.com/x"), "https://example.com/x");
});

test("twitter.com is x.com", () => {
  assert.equal(canonical("https://twitter.com/someone"), "https://x.com/someone");
  assert.equal(canonical("https://www.twitter.com/someone/"), "https://x.com/someone");
  assert.equal(canonical("https://mobile.twitter.com/someone"), "https://mobile.twitter.com/someone");
});

test("youtu.be links become youtube.com/watch", () => {
  assert.equal(canonical("https://youtu.be/NDdc39KYqDU"), "https://youtube.com/watch?v=NDdc39KYqDU");
  assert.equal(canonical("https://youtu.be/NDdc39KYqDU?utm_source=x"), "https://youtube.com/watch?v=NDdc39KYqDU");
  assert.equal(canonical("https://www.youtube.com/watch?v=NDdc39KYqDU&si=abc"), "https://youtube.com/watch?v=NDdc39KYqDU");
});

test("arXiv abs, pdf and html pages of any version are one paper", () => {
  for (const u of ["https://arxiv.org/abs/2503.01840", "http://arxiv.org/abs/2503.01840v1",
    "https://www.arxiv.org/pdf/2503.01840", "https://arxiv.org/pdf/2503.01840v3.pdf",
    "https://arxiv.org/html/2503.01840v2", "https://export.arxiv.org/abs/2503.01840?context=cs#x"]) {
    assert.equal(canonical(u), "https://arxiv.org/abs/2503.01840", u);
  }
  assert.equal(canonical("https://arxiv.org/abs/1706.0376"), "https://arxiv.org/abs/1706.0376");
});

test("arXiv pages that are not papers are treated like any other URL", () => {
  assert.equal(canonical("https://arxiv.org/list/cs.CL/recent/"), "https://arxiv.org/list/cs.CL/recent");
  assert.equal(canonical("https://arxiv.org/abs/2503.01840/extra"), "https://arxiv.org/abs/2503.01840/extra");
});

test("tracking parameters are dropped case-insensitively", () => {
  assert.equal(canonical("https://example.com/p?UTM_Source=a&utm_medium=b&utm_x=1"), "https://example.com/p");
  assert.equal(canonical("https://example.com/p?fbclid=1&gclid=2&dclid=3&msclkid=4&mc_cid=5&mc_eid=6&igshid=7"),
    "https://example.com/p");
  assert.equal(canonical("https://example.com/p?si=1&ref=2&ref_src=3&_hsenc=4&_hsmi=5&mkt_tok=6&id=9"),
    "https://example.com/p?id=9");
  assert.equal(canonical("https://example.com/p?reference=1&utm=2"), "https://example.com/p?reference=1&utm=2");
});

test("remaining parameters are sorted stably by name and serialised by URLSearchParams", () => {
  assert.equal(canonical("https://example.com/s?q=b&a=2&q=a"), "https://example.com/s?a=2&q=b&q=a");
  assert.equal(canonical("https://example.com/s?q=hello%20world"), "https://example.com/s?q=hello+world");
  assert.equal(canonical("https://example.com/s?flag&x="), "https://example.com/s?flag=&x=");
  assert.equal(canonical("https://example.com/s?"), "https://example.com/s");
});

test("fragments are dropped unless they are app routes", () => {
  assert.equal(canonical("https://example.com/a#section-2"), "https://example.com/a");
  assert.equal(canonical("https://example.com/#!/page/2"), "https://example.com/#!/page/2");
  assert.equal(canonical("https://example.com/app/#/inbox?x=1"), "https://example.com/app#/inbox?x=1");
  assert.equal(canonical("https://example.com/a#"), "https://example.com/a");
});

test("trailing slash removed except for the root path; path case kept", () => {
  assert.equal(canonical("https://example.com/"), "https://example.com/");
  assert.equal(canonical("https://example.com"), "https://example.com/");
  assert.equal(canonical("https://example.com/A/B/"), "https://example.com/A/B");
  assert.equal(canonical("https://Example.COM/CaseKept"), "https://example.com/CaseKept");
});

test("duplicateGroups groups indices by canonical form", () => {
  const urls = [
    "https://www.example.com/a/",            // 0
    "https://arxiv.org/abs/2503.01840",      // 1
    "chrome://newtab/",                      // 2
    "http://example.com/a?utm_source=x",     // 3
    "https://arxiv.org/pdf/2503.01840v2",    // 4
    "https://example.com/b",                 // 5
    "chrome://newtab/",                      // 6
    "https://example.com/a#top",             // 7
  ];
  assert.deepEqual(duplicateGroups(urls), [[0, 3, 7], [1, 4], [2, 6]]);
});

test("duplicateGroups: nothing duplicated, and the empty array", () => {
  assert.deepEqual(duplicateGroups(["https://a.com/", "https://b.com/"]), []);
  assert.deepEqual(duplicateGroups([]), []);
});
