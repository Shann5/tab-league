import test from "node:test";
import assert from "node:assert/strict";
import { profile, nameKey, groupPeople } from "../brain/people.js";

test("X profiles, with the name from the title", () => {
  assert.deepEqual(profile("https://x.com/MiraOkafor", "Mira Okafor (@MiraOkafor) / X"),
    { site: "x", handle: "MiraOkafor", name: "Mira Okafor" });
  assert.deepEqual(profile("https://twitter.com/lenafischer_ai/", "Lena Fischer (@lenafischer_ai) / X"),
    { site: "x", handle: "lenafischer_ai", name: "Lena Fischer" });
  assert.deepEqual(profile("https://mobile.twitter.com/a?lang=en", "something else"), null);
});

test("X: titles without the shape give a null name; non-profile paths give null", () => {
  assert.deepEqual(profile("https://www.x.com/someone", "X"), { site: "x", handle: "someone", name: null });
  for (const p of ["home", "Explore", "search", "i", "settings", "messages", "notifications", "compose", "hashtag",
    "intent", "login"]) {
    assert.equal(profile(`https://x.com/${p}`, "Home / X"), null, p);
  }
  assert.equal(profile("https://x.com/someone/status/123", "post"), null);
  assert.equal(profile("https://x.com/", "X"), null);
});

test("LinkedIn profiles", () => {
  assert.deepEqual(profile("https://www.linkedin.com/in/tomas-reyes/", "Tomas Reyes - Assistant Professor - Example University | LinkedIn"),
    { site: "linkedin", handle: "tomas-reyes", name: "Tomas Reyes" });
  assert.deepEqual(profile("https://linkedin.com/in/jdoe", "Jane Doe | LinkedIn"),
    { site: "linkedin", handle: "jdoe", name: "Jane Doe" });
  assert.deepEqual(profile("https://linkedin.com/in/jdoe", "LinkedIn"), { site: "linkedin", handle: "jdoe", name: null });
  assert.deepEqual(profile("https://ca.linkedin.com/in/jdoe", "Jane Doe | LinkedIn"), null);
  assert.equal(profile("https://linkedin.com/company/anthropic", "Anthropic | LinkedIn"), null);
  assert.equal(profile("https://linkedin.com/in/jdoe/details/experience", "Jane Doe | LinkedIn"), null);
});

test("LinkedIn name stops at whichever separator comes first", () => {
  assert.equal(profile("https://linkedin.com/in/x", "Ana Li | Founder - Stealth | LinkedIn").name, "Ana Li");
  assert.equal(profile("https://linkedin.com/in/x", "Ana Li - Founder | Stealth | LinkedIn").name, "Ana Li");
});

test("GitHub profiles", () => {
  assert.deepEqual(profile("https://github.com/devjo", "devjo (Jo Park) · GitHub"),
    { site: "github", handle: "devjo", name: "Jo Park" });
  assert.deepEqual(profile("https://github.com/someone?tab=repositories", "someone · GitHub"),
    { site: "github", handle: "someone", name: null });
  assert.equal(profile("https://github.com/SafeAILab/EAGLE", "GitHub - SafeAILab/EAGLE"), null);
  for (const p of ["topics", "features", "explore", "marketplace", "settings", "login", "about", "pricing", "sponsors",
    "notifications", "new", "Orgs"]) {
    assert.equal(profile(`https://github.com/${p}`, "GitHub"), null, p);
  }
});

test("Google Scholar profiles", () => {
  assert.deepEqual(profile("https://scholar.google.com/citations?user=AbC123&hl=en", "Lena Fischer - Google Scholar"),
    { site: "scholar", handle: "AbC123", name: "Lena Fischer" });
  assert.equal(profile("https://scholar.google.com/citations?hl=en", "Google Scholar"), null);
  assert.equal(profile("https://scholar.google.com/scholar?q=x", "x - Google Scholar"), null);
});

test("anything else is not a profile", () => {
  assert.equal(profile("https://example.com/about", "About me"), null);
  assert.equal(profile("not a url", "x"), null);
  assert.equal(profile("https://mira.substack.com/", "Mira's Substack"), null);
});

test("nameKey folds accents, case and punctuation", () => {
  assert.equal(nameKey("José  Ramírez-Ortiz"), "jose ramirez ortiz");
  assert.equal(nameKey("  MIRA   okafor "), "mira okafor");
  assert.equal(nameKey("Dr. Ana-María O'Neil"), "dr ana maria o neil");
  assert.equal(nameKey("王小明"), "王小明");
  assert.equal(nameKey("Zoë 2"), "zoe 2");
});

test("groupPeople merges by name across sites, keeps order, includes singletons", () => {
  const pages = [
    { url: "https://example.com/", title: "Home" },                                                       // 0
    { url: "https://x.com/miraokafor", title: "Mira Okafor (@miraokafor) / X" },                          // 1
    { url: "https://github.com/octo", title: "octo · GitHub" },                                            // 2
    { url: "https://linkedin.com/in/mira-o", title: "Mira  Okafor - Researcher | LinkedIn" },          // 3
    { url: "https://scholar.google.com/citations?user=Q1", title: "Lena Fischer - Google Scholar" },        // 4
    { url: "https://github.com/mokafor", title: "mokafor (mira okafor) · GitHub" },                          // 5
  ];
  assert.deepEqual(groupPeople(pages), [
    { name: "Mira Okafor", pages: [1, 3, 5] },
    { name: "@octo", pages: [2] },
    { name: "Lena Fischer", pages: [4] },
  ]);
});

test("same site and handle ignoring case is the same person, and grouping is transitive", () => {
  const pages = [
    { url: "https://x.com/AnaLi", title: "X" },                                    // 0: no name
    { url: "https://twitter.com/anali", title: "Ana Li (@anali) / X" },           // 1: same handle as 0
    { url: "https://github.com/ana-li", title: "ana-li (Ana Li) · GitHub" },      // 2: same name as 1
    { url: "https://github.com/AnaLi", title: "AnaLi · GitHub" },                 // 3: other site, handle only
  ];
  assert.deepEqual(groupPeople(pages), [
    { name: "Ana Li", pages: [0, 1, 2] },
    { name: "@AnaLi", pages: [3] },
  ]);
});

test("the group name comes from the lowest-index page that has a name", () => {
  const pages = [
    { url: "https://x.com/jd", title: "X" },
    { url: "https://x.com/JD", title: "Jane Doe (@JD) / X" },
    { url: "https://linkedin.com/in/jd", title: "Jane  Doe | LinkedIn" },
  ];
  assert.deepEqual(groupPeople(pages), [{ name: "Jane Doe", pages: [0, 1, 2] }]);
});

test("no profiles at all", () => {
  assert.deepEqual(groupPeople([]), []);
  assert.deepEqual(groupPeople([{ url: "https://example.com", title: "x" }]), []);
});
