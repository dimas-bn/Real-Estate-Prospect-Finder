function findProspectsLevel2() {
  const sheetInput = SpreadsheetApp.getActive().getSheetByName("Input");
  const sheetOutput = SpreadsheetApp.getActive().getSheetByName("Output");

  const apiKey = sheetInput.getRange("B1").getValue();
  const keyword = sheetInput.getRange("B2").getValue();
  const location = sheetInput.getRange("B3").getValue();
  const radius = sheetInput.getRange("B4").getValue();

  const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${apiKey}`;
  const geoData = JSON.parse(UrlFetchApp.fetch(geocodeUrl).getContentText());

  if (geoData.status !== "OK") {
    sheetOutput.getRange(1,1).setValue("Lokasi tidak ditemukan.");
    return;
  }

  const lat = geoData.results[0].geometry.location.lat;
  const lng = geoData.results[0].geometry.location.lng;

  const allResults = [];
  let nextPageToken = "";

  do {
    let placesUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&keyword=${encodeURIComponent(keyword)}&key=${apiKey}`;

    if (nextPageToken) {
      Utilities.sleep(2000);
      placesUrl += `&pagetoken=${nextPageToken}`;
    }

    const data = JSON.parse(UrlFetchApp.fetch(placesUrl).getContentText());

    if (data.results) {
      allResults.push(...data.results);
    }

    nextPageToken = data.next_page_token || "";

  } while (nextPageToken);

  const finalOutput = [];

  allResults.forEach(place => {
    const name = place.name || "";
    const address = place.vicinity || "";
    const rating = place.rating || "";
    const reviews = place.user_ratings_total || "";
    const placeId = place.place_id || "";

    // DETAIL CHECK
    const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,formatted_phone_number,website,url&key=${apiKey}`;
    const detail = JSON.parse(UrlFetchApp.fetch(detailUrl).getContentText());

    const website = detail.result.website || "";
    const phone = detail.result.formatted_phone_number || "";
    const mapsUrl = detail.result.url || "";

    // SMART CHECK
    const webStatus = checkWebsiteStatus(website);
    const techType = checkTechType(website);
    const insight = generateInsight(rating, website, webStatus, techType, reviews);

    finalOutput.push([
      name, address, rating, reviews, website, phone, mapsUrl, techType, webStatus, insight
    ]);
  });

  // OUTPUT
  sheetOutput.clearContents();
  sheetOutput.appendRow(["Nama", "Alamat", "Rating", "Reviews", "Website", "Phone", "Maps Link", "WP/Non-WP", "Status Website", "Insight"]);

  if (finalOutput.length > 0) {
    sheetOutput.getRange(2,1,finalOutput.length, finalOutput[0].length).setValues(finalOutput);
  }
}


// ===== Helper Functions =====


function checkWebsiteStatus(url) {
  if (!url) return "Tidak ada website";

  try {
    const res = UrlFetchApp.fetch(url, {muteHttpExceptions: true});
    const code = res.getResponseCode();

    if (code >= 200 && code < 300) {
      if (url.startsWith("http://")) return "Tidak aman (HTTP)";
      return "Website OK";
    } else if (code === 404) {
      return "Website mati (404)";
    } else {
      return "Website bermasalah";
    }
  } catch (e) {
    return "Website tidak bisa diakses";
  }
}

function checkTechType(url) {
  if (!url) return "-";

  try {
    const html = UrlFetchApp.fetch(url, {muteHttpExceptions: true}).getContentText().toLowerCase();
    if (html.includes("wp-content") || html.includes("wordpress")) return "WordPress";
    return "Non-WordPress";
  } catch (e) {
    return "Unknown";
  }
}

function generateInsight(rating, website, status, tech, reviews) {
  if (!website) return "Tidak punya website → Prospek PRIORITAS";

  if (status === "Tidak aman (HTTP)") return "Butuh SSL → Prospek maintenance";
  if (status === "Website mati (404)" || status === "Website bermasalah") return "Website error → Prospek redesign";
  if (tech === "WordPress" && status === "Website OK") return "WordPress → Prospek maintenance/SEO";

  if (rating >= 4.5 && reviews >= 50 && !website) return "Rating tinggi tanpa website → Prospek PREMIUM";

  return "Potensi prospek umum";
}
