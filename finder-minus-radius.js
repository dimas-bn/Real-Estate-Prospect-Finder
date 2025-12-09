 function findProspectsLevel2() {
  const sheetInput  = SpreadsheetApp.getActive().getSheetByName("Input");
  const sheetOutput = SpreadsheetApp.getActive().getSheetByName("Output");

// === HANYA ADA 3 ISIAN (sebelumnya pakai radius) ===
  const apiKey   = sheetInput.getRange("B1").getValue();
  const keyword  = sheetInput.getRange("B2").getValue().toString().trim();
  const location = sheetInput.getRange("B3").getValue().toString().trim();

  if (!apiKey || !keyword || !location) {
    sheetOutput.getRange(1,1).setValue("Isi API Key, Keyword, dan Lokasi di sheet Input!");
    return;
  }

  const allResults = [];
  let pageToken = "";

  do {
    let url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(keyword + " in " + location)}&key=${apiKey}`;
    
    if (pageToken) {
      Utilities.sleep(2500);
      url += `&pagetoken=${pageToken}`;
    }

    const response = UrlFetchApp.fetch(url, {muteHttpExceptions: true});
    const data = JSON.parse(response.getContentText());

    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      sheetOutput.getRange(1,1).setValue("Error API: " + data.status);
      return;
    }

    if (data.results) allResults.push(...data.results);
    pageToken = data.next_page_token || "";

  } while (pageToken && allResults.length < 250);

  const finalOutput = [];

  allResults.forEach(place => {
    const name    = place.name || "";
    const address = place.formatted_address || place.vicinity || "";
    const rating  = place.rating || "";
    const reviews = place.user_ratings_total || "";
    const placeId = place.place_id || "";

    let website = "", phone = "", mapsUrl = "";
    if (placeId) {
      const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=website,formatted_phone_number,url&key=${apiKey}`;
      try {
        const detail = JSON.parse(UrlFetchApp.fetch(detailUrl, {muteHttpExceptions: true}).getContentText());
        website = detail.result?.website || "";
        phone   = detail.result?.formatted_phone_number || "";
        mapsUrl = detail.result?.url || "";
      } catch(e) {
        // ignore error detail
      }
    }

    const webStatus = checkWebsiteStatus(website);
    const techType  = checkTechType(website);
    const insight   = generateInsight(rating, website, webStatus, techType, reviews);

    finalOutput.push([name, address, rating, reviews, website, phone, mapsUrl, techType, webStatus, insight]);
  });

  // Output
  sheetOutput.clearContents();
  sheetOutput.appendRow(["Nama","Alamat","Rating","Reviews","Website","Phone","Maps Link","WP/Non-WP","Status Website","Insight"]);
  if (finalOutput.length > 0) {
    sheetOutput.getRange(2,1,finalOutput.length,10).setValues(finalOutput);
  }
  sheetOutput.getRange(1,1).setValue(`Selesai! Ditemukan ${finalOutput.length} prospek.`);
}


// ================== HELPER FUNCTIONS (WAJIB ADA) ==================

function checkWebsiteStatus(url) {
  if (!url || url === "") return "Tidak ada website";
  if (!url.startsWith("http")) url = "https://" + url;

  try {
    const res = UrlFetchApp.fetch(url, {muteHttpExceptions: true, followRedirects: false});
    const code = res.getResponseCode();

    if (code >= 200 && code < 300) {
      return url.startsWith("http://") ? "Tidak aman (HTTP)" : "Website OK";
    } else if (code === 404) {
      return "Website mati (404)";
    } else {
      return `Website error (${code})`;
    }
  } catch (e) {
    return "Tidak bisa diakses";
  }
}

function checkTechType(url) {
  if (!url || url === "") return "-";
  if (!url.startsWith("http")) url = "https://" + url;

  try {
    const html = UrlFetchApp.fetch(url, {muteHttpExceptions: true}).getContentText().toLowerCase();
    if (html.includes("wp-content") || html.includes("wordpress") || html.includes("wp-includes")) {
      return "WordPress";
    }
    return "Non-WordPress";
  } catch (e) {
    return "Unknown";
  }
}

function generateInsight(rating, website, status, tech, reviews) {
  if (!website) return "Tidak punya website → Prospek PRIORITAS";

  if (status.includes("Tidak aman") || status.includes("HTTP)")) return "Butuh SSL → Prospek maintenance";
  if (status.includes("mati") || status.includes("error")) return "Website rusak → Prospek redesign";
  if (tech === "WordPress" && status === "Website OK") return "WordPress → Prospek maintenance/SEO";

  if (rating >= 4.5 && reviews >= 50) return "Rating tinggi → Prospek PREMIUM";

  return "Potensi prospek umum";
}
