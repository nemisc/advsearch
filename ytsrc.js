// ==============================
// YOUTUBE RESEARCH TOOL SCRIPT
// Infinite scroll + 500 results
// API key form + auto save
// ==============================

let API_KEY = "";

// ---------- DOM ELEMENTS ----------
const elements = {
  apiKey: document.getElementById("apiKey"),

  searchQuery: document.getElementById("searchQuery"),
  searchBtn: document.getElementById("searchBtn"),

  minViews: document.getElementById("minViews"),
  maxViews: document.getElementById("maxViews"),

  dateAfter: document.getElementById("dateAfter"),
  dateBefore: document.getElementById("dateBefore"),

  vidDuration: document.getElementById("vidDuration"),
  ageRestricted: document.getElementById("ageRestricted"),

  sortBy: document.getElementById("sortBy"),

  error: document.getElementById("error"),
  loading: document.getElementById("loading"),
  results: document.getElementById("results"),
  resultsInfo: document.getElementById("resultsInfo"),
  emptyState: document.getElementById("emptyState"),
};

// ---------- SAVE API KEY ----------

const savedKey = localStorage.getItem("yt_api_key");

if (savedKey && elements.apiKey) {
  elements.apiKey.value = savedKey;
}

if (elements.apiKey) {
  elements.apiKey.addEventListener("input", () => {
    localStorage.setItem("yt_api_key", elements.apiKey.value.trim());
  });
}

// ---------- STATE ----------

let nextPageToken = null;
let loadingMore = false;
let totalLoaded = 0;

const MAX_RESULTS = 500;

// ---------- DEFAULT SETTINGS ----------

if (elements.sortBy) elements.sortBy.value = "date";

const dateToday = new Date();
const dateMonthAgo = new Date();

dateMonthAgo.setMonth(dateMonthAgo.getMonth() - 1);

if (elements.dateAfter)
  elements.dateAfter.value = dateMonthAgo.toISOString().substring(0, 10);

if (elements.dateBefore)
  elements.dateBefore.value = dateToday.toISOString().substring(0, 10);

// ---------- HELPERS ----------

function formatViews(count) {
  if (!count) return "0";

  const num = parseInt(count);

  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;

  return num.toLocaleString();
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function showError(message) {
  if (!elements.error) return;

  elements.error.textContent = message;
  elements.error.style.display = "block";
}

function hideError() {
  if (!elements.error) return;

  elements.error.style.display = "none";
}

function showLoading() {
  if (elements.loading) elements.loading.style.display = "flex";
}

function hideLoading() {
  if (elements.loading) elements.loading.style.display = "none";
}

// ---------- VIDEO CARD ----------

function createVideoCard(video) {
  const card = document.createElement("div");

  card.className = "video-card";

  card.innerHTML = `

<div class="video-thumbnail">

<img src="${video.snippet.thumbnails.medium.url}" />

<div class="view-badge">
${formatViews(video.statistics.viewCount)} views
</div>

</div>

<div class="video-info">

<h3 class="video-title">
${video.snippet.title}
</h3>

<p class="video-channel">
${video.snippet.channelTitle}
</p>

<div class="video-footer">

<span>
${formatDate(video.snippet.publishedAt)}
</span>

<a
href="https://www.youtube.com/watch?v=${video.id.videoId}"
target="_blank"
class="video-link"
>
Watch
</a>

</div>

</div>

`;

  return card;
}

// ---------- DISPLAY ----------

function displayResults(videos) {
  if (!videos.length) return;

  videos.forEach((video) => {
    elements.results.appendChild(createVideoCard(video));
  });

  totalLoaded += videos.length;

  if (elements.resultsInfo)
    elements.resultsInfo.textContent = `Loaded ${totalLoaded} videos`;
}

// ---------- FETCH STATS ----------

async function fetchVideoStats(ids) {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails&id=${ids.join(",")}&key=${API_KEY}`;

  const res = await fetch(url);
  const data = await res.json();

  return data.items || [];
}

// ---------- SEARCH ----------

async function searchVideos(reset = true) {
  if (loadingMore) return;

  API_KEY = elements.apiKey?.value.trim();

  if (!API_KEY) {
    showError("Please enter your YouTube API key");
    return;
  }

  const query = elements.searchQuery?.value.trim();

  if (!query) {
    showError("Enter a search query");
    return;
  }

  if (reset) {
    elements.results.innerHTML = "";
    nextPageToken = null;
    totalLoaded = 0;
  }

  if (totalLoaded >= MAX_RESULTS) return;

  loadingMore = true;

  hideError();
  showLoading();

  try {
    const params = new URLSearchParams({
      part: "snippet",
      q: query,
      type: "video",
      maxResults: 50,
      order: elements.sortBy?.value || "date",
      key: API_KEY,
    });

    if (nextPageToken) params.append("pageToken", nextPageToken);

    if (elements.dateAfter?.value)
      params.append(
        "publishedAfter",
        new Date(elements.dateAfter.value).toISOString(),
      );

    if (elements.dateBefore?.value)
      params.append(
        "publishedBefore",
        new Date(elements.dateBefore.value).toISOString(),
      );

    if (elements.vidDuration?.value && elements.vidDuration.value !== "any")
      params.append("videoDuration", elements.vidDuration.value);

    const url = `https://www.googleapis.com/youtube/v3/search?${params}`;

    const res = await fetch(url);

    const data = await res.json();

    if (data.error) throw new Error(data.error.message);

    nextPageToken = data.nextPageToken || null;

    const ids = data.items.map((v) => v.id.videoId);

    const stats = await fetchVideoStats(ids);

    const statMap = {};

    stats.forEach((s) => {
      statMap[s.id] = s;
    });

    let combined = data.items.map((item) => ({
      ...item,
      statistics: statMap[item.id.videoId]?.statistics || {},
      contentDetails: statMap[item.id.videoId]?.contentDetails || {},
    }));

    const minViews = elements.minViews?.value;
    const maxViews = elements.maxViews?.value;

    if (minViews || maxViews) {
      combined = combined.filter((video) => {
        const views = parseInt(video.statistics.viewCount || "0");

        const min = minViews ? parseInt(minViews) : 0;
        const max = maxViews ? parseInt(maxViews) : Infinity;

        return views >= min && views <= max;
      });
    }

    const ageFilter = elements.ageRestricted?.value;

    if (ageFilter === "true") {
      combined = combined.filter(
        (video) =>
          video.contentDetails?.contentRating?.ytRating === "ytAgeRestricted",
      );
    }

    displayResults(combined);
  } catch (err) {
    console.error(err);

    showError(err.message);
  } finally {
    hideLoading();

    loadingMore = false;
  }
}

// ---------- INFINITE SCROLL ----------

window.addEventListener("scroll", () => {
  if (!nextPageToken) return;

  const scrollPosition = window.innerHeight + window.scrollY;

  const pageHeight = document.body.offsetHeight;

  if (scrollPosition >= pageHeight - 800) {
    searchVideos(false);
  }
});

// ---------- EVENTS ----------

if (elements.searchBtn)
  elements.searchBtn.addEventListener("click", () => searchVideos(true));

if (elements.searchQuery)
  elements.searchQuery.addEventListener("keypress", (e) => {
    if (e.key === "Enter") searchVideos(true);
  });
