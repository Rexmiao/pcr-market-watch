import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const workerPath = resolve(projectRoot, "dist/server/index.js");
const manifestPath = resolve(projectRoot, "dist/.openai/hosting.json");

const [source, manifest] = await Promise.all([
  readFile(workerPath, "utf8"),
  readFile(manifestPath, "utf8"),
]);
JSON.parse(manifest);

// A data URL forces ESM parsing even though the generated output has no package.json.
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const workerModule = await import(moduleUrl);
assert.equal(
  typeof workerModule.default?.fetch,
  "function",
  `${pathToFileURL(workerPath)} must export default.fetch`,
);

const monitorPage=await workerModule.default.fetch(new Request('https://pcr.example/options-monitor.html'),{},{});
assert.equal(monitorPage.status,200,'The independent options page must be packaged and routed.');
assert((await monitorPage.text()).includes('/options-monitor-page.js'));
const home=await workerModule.default.fetch(new Request('https://pcr.example/'),{},{});
assert(!(await home.text()).includes('src="/option-monitor.js"'),'The homepage must not start options monitoring.');
const cloudOi=await workerModule.default.fetch(new Request('https://pcr.example/api/oi-summaries?symbols=NVDA'),{},{});
assert.equal(cloudOi.status,503);
assert.equal((await cloudOi.json()).status,'local_backend_required');
const reviewPage=await workerModule.default.fetch(new Request('https://pcr.example/quote-reviews.html'),{},{});
assert.equal(reviewPage.status,200,'The scheduled-review page must be packaged.');
assert((await reviewPage.text()).includes('/quote-reviews.js'));
const cloudReviews=await workerModule.default.fetch(new Request('https://pcr.example/api/quote-reviews'),{},{});
assert.equal(cloudReviews.status,501);assert.equal((await cloudReviews.json()).supported,false);
const cloudBriefQuotes=await workerModule.default.fetch(new Request('https://pcr.example/api/brief-quotes/status'),{},{});
assert.equal(cloudBriefQuotes.status,501);assert.equal((await cloudBriefQuotes.json()).supported,false);
console.log("Artifact is valid ESM, serves the independent monitor, keeps homepage monitoring off and preserves the local-only OI boundary");
