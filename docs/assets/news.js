(() => {
  async function fetchPostsIndex() {
    const url = new URL("./nieuws/posts-index.json", window.location.href).href;
    const response = await fetch(`${url}?_=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("posts-index");
    return response.json();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderNewsCards(posts, limit = null) {
    const slice = limit ? posts.slice(0, limit) : posts;
    if (!slice.length) return "";
    return slice.map(post => `
      <a class="news-card" href="${escapeHtml(post.url)}">
        <time datetime="${escapeHtml(post.date)}">${escapeHtml(post.date)}</time>
        <h2>${escapeHtml(post.title)}</h2>
        <p>${escapeHtml(post.excerpt || "")}</p>
      </a>`).join("");
  }

  async function mountNewsList(options = {}) {
    const {
      listId = "newsList",
      statusId = "newsStatus",
      limit = null,
      emptyMessage = "Nog geen berichten gepubliceerd."
    } = options;
    const list = document.getElementById(listId);
    const status = document.getElementById(statusId);
    if (!list) return [];
    try {
      const posts = await fetchPostsIndex();
      if (!posts.length) {
        if (status) status.textContent = emptyMessage;
        return [];
      }
      list.innerHTML = renderNewsCards(posts, limit);
      if (status) status.textContent = "";
      return posts;
    } catch {
      if (status) {
        status.textContent = "Nieuws kon niet worden geladen.";
        status.className = "api-status error";
      }
      return [];
    }
  }

  window.ScheveTorenNews = { fetchPostsIndex, renderNewsCards, mountNewsList };
})();
