// Tell Bing (and Yahoo/DuckDuckGo through it), Yandex, Naver and Seznam about every page in the
// live sitemap, in one go. Run after a release that adds or changes pages:
//
//   node scripts/indexnow-submit.mjs                      (the live site)
//   node scripts/indexnow-submit.mjs https://example.com  (another address)
//
// It reads the live sitemap, checks that the key file is really online, then sends the list.
// Day to day the site pings by itself when content is saved in Admin (src/lib/indexnow.ts).

const SITE = (process.argv[2] || "https://www.sancharitrips.com").replace(/\/+$/, "");
const KEY = "de1c819f0c470e1772dec3b99546a534";
const ENDPOINTS = ["https://api.indexnow.org/indexnow", "https://www.bing.com/indexnow"];

const keyText = await (await fetch(`${SITE}/${KEY}.txt`, { cache: "no-store" })).text();
if (keyText.trim() !== KEY) {
  console.error(`Key file ${SITE}/${KEY}.txt is not online yet (got: ${keyText.slice(0, 60)}). Deploy first.`);
  process.exit(1);
}

const xml = await (await fetch(`${SITE}/sitemap.xml`, { cache: "no-store" })).text();
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&").trim());
if (urls.length === 0) {
  console.error("The sitemap lists no pages.");
  process.exit(1);
}

const body = JSON.stringify({ host: new URL(SITE).host, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList: urls });
let failed = false;
for (const endpoint of ENDPOINTS) {
  const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body });
  const text = (await res.text()).slice(0, 200);
  // 200 = received, 202 = received and the key is being checked.
  console.log(`${endpoint} -> HTTP ${res.status} ${text}`);
  if (res.status !== 200 && res.status !== 202) failed = true;
}
console.log(`${urls.length} pages sent.`);
process.exit(failed ? 1 : 0);
