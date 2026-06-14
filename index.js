const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Headless browser, launched once and reused across requests ----
let browserInstance = null;

async function getBrowser() {
  try {
    if (browserInstance && browserInstance.connected) return browserInstance;
  } catch (e) { /* fall through and relaunch */ }

  browserInstance = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu"
    ]
  });
  return browserInstance;
}

// ---- Core: load an FDRD event page, capture the description the page loads ----
async function getFdrdDescription(eventId) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  let descriptionHtml = null;

  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Speed things up + save memory: skip images, fonts, and media
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const t = req.resourceType();
      if (t === "image" || t === "media" || t === "font") req.abort();
      else req.continue();
    });

    // Eavesdrop on the data call the page makes for this event
    page.on("response", async (resp) => {
      try {
        if (/\/api\/portal\/event\/\d+/.test(resp.url())) {
          const json = await resp.json();
          if (json && json.description) descriptionHtml = json.description;
        }
      } catch (e) { /* ignore non-JSON / unreadable responses */ }
    });

    // event.jsp redirects into the portal, which does the token handshake
    // and loads the event data all on its own.
    await page.goto(
      "https://fdrd.app.neoncrm.com/np/clients/fdrd/event.jsp?event=" + encodeURIComponent(eventId),
      { waitUntil: "networkidle2", timeout: 45000 }
    );

    // Give the data call a moment to arrive if it hasn't yet
    const start = Date.now();
    while (!descriptionHtml && Date.now() - start < 8000) {
      await new Promise((r) => setTimeout(r, 250));
    }

    return descriptionHtml || "";
  } finally {
    await page.close();
  }
}

// ---- Turn the description HTML into clean plain text ----
function htmlToText(html) {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

// ---- Routes ----
app.get("/", (req, res) => {
  res.send("FDRD description service is running.");
});

app.get("/fdrd-description", async (req, res) => {
  const eventId = String(req.query.eventId || "").replace(/\D/g, "");
  if (!eventId) {
    return res.status(400).json({ error: "missing or invalid eventId" });
  }

  try {
    const html = await getFdrdDescription(eventId);
    res.json({ eventId, description: htmlToText(html) });
  } catch (err) {
    console.error("FDRD scrape error:", err && err.message ? err.message : err);
    res.status(500).json({ eventId, description: "", error: String(err && err.message ? err.message : err) });
  }
});

app.listen(PORT, () => {
  console.log("FDRD description service listening on port " + PORT);
});
