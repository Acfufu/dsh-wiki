// dsh-wiki host half offline harness — fake cordis ctx, drive apply() end to end.
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
const { apply } = await import(pathToFileURL(path.join(import.meta.dirname, "..", "lib", "index.js")).href);

const FAILS = [];
const check = (name, ok, detail = "") => {
  console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : `  [${detail}]`));
  if (!ok) FAILS.push(name);
};

// fixture repo with a built wiki
const repo = mkdtempSync(path.join(tmpdir(), "dsh-wiki-harness-"));
mkdirSync(path.join(repo, ".dsh-wiki", "site"), { recursive: true });
writeFileSync(path.join(repo, ".dsh-wiki", "wiki.json"), JSON.stringify({ schema: "repo-wiki-local/1", repoId: repo, title: "Demo Repo", pages: [] }));
writeFileSync(path.join(repo, ".dsh-wiki", "site", "index.html"), "<!DOCTYPE html><html><main><h1>demo</h1></main></html>");
// second repo without site (should be skipped in list, still valid for view error)
const repoNoSite = mkdtempSync(path.join(tmpdir(), "dsh-wiki-harness2-"));
mkdirSync(path.join(repoNoSite, ".dsh-wiki"), { recursive: true });

const disposers = [];
const registered = { skills: [], commands: [], routes: [] };
const ctx = {
  effect: (fn, label) => { const d = fn(); disposers.push(d); return d; },
  get: (name) => ctx[name],
  on: (ev, fn) => { ctx["_on_" + ev] = fn; return () => delete ctx["_on_" + ev]; },
  skills: { register: (s) => { registered.skills.push(s); return () => {}; } },
  commands: { register: (c) => { registered.commands.push(c); return () => {}; } },
  webServer: {
    port: 19387,
    register: (r) => { registered.routes.push(r); return () => {}; },
  },
  subagents: {
    getProvider: (k) => ({ inheritsParentContext: true }),
    start: async (k, opts) => {
      ctx["_legacyStart"] = opts;
      return { result: Promise.resolve({ ok: true }), dispose: async () => {} };
    },
  },
  logger: { warn: (m) => console.log("LOG", m) },
};

apply(ctx, { wikiDirName: ".dsh-wiki", wikiRoots: [repo, repoNoSite] });
// simulate a session event so the cwd book also has the fixture repo
ctx["_on_session/event"]({ header: { cwd: repo } }, {});
await new Promise((r) => setTimeout(r, 10)); // let debounced persist settle harmlessly

// skill registered with builder path baked in
check("skill registered", registered.skills.length === 1);
const skill = registered.skills[0];
check("skill name/kebab", skill?.name === "dsh-wiki");
check("skill content has builder abs path", typeof skill?.content === "string" && skill.content.includes(path.join(import.meta.dirname, "..", "scripts", "build_wiki_site.py")));
check("skill placeholder replaced", !skill?.content?.includes("{{BUILDER_PATH}}"));
check("skill source runtime", skill?.source === "runtime");

// command registered
check("command registered", registered.commands.length === 1 && registered.commands[0].name === "wiki");

// routes registered
check("route registered", registered.routes.length === 1 && registered.routes[0].kind === "prefix" && registered.routes[0].path === "/dsh-wiki");
const handler = registered.routes[0].handler;

const resOf = () => {
  const res = { status: 0, headers: null, body: "" };
  res.writeHead = (s, h) => { res.status = s; res.headers = h; };
  res.end = (b) => { res.body = b ?? ""; };
  return res;
};

// 1. status JSON
let res = resOf();
await handler({ method: "GET", headers: { host: "127.0.0.1:19387" }, url: "/dsh-wiki/api/status" }, res);
let body = JSON.parse(res.body);
check("status 200", res.status === 200 && body.ok === true);
check("status lists fixture wiki", body.wikis.some((w) => w.root === repo && w.title === "Demo Repo"));
check("status excludes no-site repo", !body.wikis.some((w) => w.root === repoNoSite));

// 2. index page
res = resOf();
await handler({ method: "GET", headers: { host: "localhost:19387" }, url: "/dsh-wiki/" }, res);
check("index 200 html", res.status === 200 && res.body.startsWith("<!DOCTYPE html>") && res.body.includes("Demo Repo"));

// 3. site serving
res = resOf();
await handler({ method: "GET", headers: { host: "127.0.0.1:19387" }, url: `/dsh-wiki/site?path=${encodeURIComponent(path.join(repo, ".dsh-wiki"))}` }, res);
check("site 200 serves index.html", res.status === 200 && res.body.includes("<!DOCTYPE html>") && res.body.includes("demo"));

// 4. security: non-loopback host
res = resOf();
await handler({ method: "GET", headers: { host: "evil.example.com" }, url: "/dsh-wiki/api/status" }, res);
check("non-loopback host 403", res.status === 403);

// 5. security: basename must be .dsh-wiki
res = resOf();
await handler({ method: "GET", headers: { host: "127.0.0.1:19387" }, url: `/dsh-wiki/site?path=${encodeURIComponent(repo)}` }, res);
check("non-wiki dir 403", res.status === 403);

// 6. security: traversal via .. resolves to non-basename
res = resOf();
await handler({ method: "GET", headers: { host: "127.0.0.1:19387" }, url: `/dsh-wiki/site?path=${encodeURIComponent(path.join(repo, ".dsh-wiki", "..", "x"))}` }, res);
check("traversal 403", res.status === 403);

// 7. missing site 404
res = resOf();
await handler({ method: "GET", headers: { host: "127.0.0.1:19387" }, url: `/dsh-wiki/site?path=${encodeURIComponent(path.join(repoNoSite, ".dsh-wiki"))}` }, res);
check("missing site 404", res.status === 404);

// 8. command /wiki view (session cwd = fixture repo)
const invocation = { rawInput: "view", agent: { session: { header: { id: "s1", cwd: repo } } }, signal: undefined };
let out = registered.commands[0].handler(invocation);
check("view success", out.kind === "success" && out.text.includes("http://127.0.0.1:19387/dsh-wiki/site?path=") && out.text.includes("Demo Repo") === false);

// 9. command /wiki view with no wiki
out = registered.commands[0].handler({ rawInput: "view", agent: { session: { header: { id: "s1", cwd: tmpdir() } } } });
check("view error when absent", out.kind === "error");

// 10. command /wiki list
out = registered.commands[0].handler({ rawInput: "list", agent: { session: { header: { id: "s1", cwd: repoNoSite } } } });
check("list shows fixture", out.kind === "success" && out.text.includes("Demo Repo"));

// 11. command /wiki generate → legacy start path (harness has no startActivation)
const genInvocation = { rawInput: "generate", agent: { session: { header: { id: "s1", cwd: repo } } }, signal: undefined };
out = registered.commands[0].handler(genInvocation);
check("generate starts", out.kind === "success" && out.text.length > 0);
await new Promise((r) => setTimeout(r, 20));
check("legacy start got prompt", ctx["_legacyStart"]?.prompt?.[0]?.text?.includes("使用 dsh-wiki 技能") && ctx["_legacyStart"].parent === genInvocation.agent);
check("legacy start label prefixed", typeof ctx["_legacyStart"].label === "string" && ctx["_legacyStart"].label.startsWith("dsh-wiki:"));

// 12. command /wiki generate <bad>
out = registered.commands[0].handler({ rawInput: "generate /nonexistent-xyz", agent: { session: { header: { id: "s1", cwd: repo } } } });
check("generate bad path error", out.kind === "error");

// 13. session event cwd tracking
ctx["_on_session/event"]({ header: { cwd: repoNoSite } }, {});
res = resOf();
await handler({ method: "GET", headers: { host: "127.0.0.1:19387" }, url: "/dsh-wiki/api/status" }, res);
check("session cwd remembered (still no site → not listed)", !JSON.parse(res.body).wikis.some((w) => w.root === repoNoSite));

// 14. unknown subcommand
out = registered.commands[0].handler({ rawInput: "frobnicate", agent: { session: { header: { id: "s1", cwd: repo } } } });
check("unknown verb error", out.kind === "error");

console.log(FAILS.length ? `\n${FAILS.length} FAILED` : "\nALL PASS");
process.exit(FAILS.length ? 1 : 0);
