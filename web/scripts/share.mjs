import { chromium } from "playwright";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
// Optional artwork regeneration; the generated PNG is committed and ordinary builds copy it.
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<html><body style="margin:0;background:#f4f1e8;color:#182d24;font-family:Arial,sans-serif"><div style="padding:48px 60px;font-size:30px;font-weight:bold">LastWord.</div><div style="margin:0 60px;background:#203b30;color:#fffdf7;padding:48px 40px 54px;text-align:center"><div style="font-size:22px;color:#c5d4c9">One public billboard on Ethereum.</div><div style="font:700 92px/1.15 Georgia,serif;letter-spacing:-3px;margin:30px 0">The word is yours.</div><div style="font-size:24px;color:#c5d4c9">One message. Until the next.</div></div></body></html>`,
  );
  await page.screenshot({
    path: resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../public/share.png",
    ),
  });
} finally {
  await browser.close();
}
