/* Lichess OAuth (PKCE). No Lichess “OAuth app” registration page is required.
   Callback file: docs/auth/callback.html → live URL …/auth/callback.html (Pages /docs root). */
(() => {
  const CLIENT_ID = "schevetoren-site";
  const TOKEN_KEY = "schevetoren_lichess_token";
  const VERIFIER_KEY = "schevetoren_lichess_verifier";
  const STATE_KEY = "schevetoren_lichess_state";
  const RETURN_KEY = "schevetoren_lichess_return";
  const ACCOUNT_CACHE_KEY = "schevetoren_lichess_account_cache";

  const base64Url = bytes =>
    btoa(String.fromCharCode(...new Uint8Array(bytes)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const randomString = length => {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return base64Url(bytes);
  };

  function redirectUri() {
    if (window.SCHEVETOREN_CONFIG?.getRedirectUri) {
      return window.SCHEVETOREN_CONFIG.getRedirectUri();
    }
    return new URL("auth/callback.html", window.location.href).origin +
      new URL("auth/callback.html", window.location.href).pathname;
  }

  function isCallbackPage() {
    return /\/auth\/callback\.html$/i.test(window.location.pathname);
  }

  function defaultReturnPath() {
    return new URL("../attendance.html", window.location.href).pathname;
  }

  function encodeState(returnPath) {
    const payload = { nonce: randomString(16), returnPath: returnPath || window.location.pathname };
    return base64Url(new TextEncoder().encode(JSON.stringify(payload)));
  }

  function decodeState(value) {
    try {
      const json = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4));
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  async function challenge(verifier) {
    return base64Url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function getAccessToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  async function exchange(code, returnedState) {
    const parsed = decodeState(returnedState);
    const storedVerifier = sessionStorage.getItem(VERIFIER_KEY);
    const storedState = sessionStorage.getItem(STATE_KEY);
    if (!storedVerifier || storedState !== returnedState) {
      throw new Error("Ongeldige OAuth state. Probeer opnieuw in te loggen.");
    }
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      client_id: CLIENT_ID,
      code_verifier: storedVerifier
    });
    const response = await fetch("https://lichess.org/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    if (!response.ok) throw new Error("Lichess-login mislukt.");
    const result = await response.json();
    if (!result.access_token) throw new Error("Geen toegangstoken ontvangen.");
    sessionStorage.setItem(TOKEN_KEY, result.access_token);
    sessionStorage.removeItem(VERIFIER_KEY);
    sessionStorage.removeItem(STATE_KEY);
    sessionStorage.removeItem(ACCOUNT_CACHE_KEY);
    if (parsed?.returnPath) sessionStorage.setItem(RETURN_KEY, parsed.returnPath);
  }

  async function getAccount(force = false) {
    const token = getAccessToken();
    if (!token) return null;
    if (!force) {
      try {
        const cached = JSON.parse(sessionStorage.getItem(ACCOUNT_CACHE_KEY) || "null");
        if (cached?.user && cached.expires > Date.now()) return cached.user;
      } catch {
        /* ignore */
      }
    }
    const response = await fetch("https://lichess.org/api/account", {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(ACCOUNT_CACHE_KEY);
      return null;
    }
    const user = await response.json();
    sessionStorage.setItem(ACCOUNT_CACHE_KEY, JSON.stringify({ user, expires: Date.now() + 5 * 60 * 1000 }));
    return user;
  }

  function render(user) {
    const loginButton = document.getElementById("lichessLoginBtn");
    const logoutButton = document.getElementById("lichessLogoutBtn");
    const userLabel = document.getElementById("lichessUser");
    if (loginButton) loginButton.hidden = Boolean(user);
    if (logoutButton) logoutButton.hidden = !user;
    if (userLabel) {
      userLabel.hidden = !user;
      userLabel.textContent = user ? `Ingelogd als ${user.username}` : "";
    }
  }

  async function login(returnPath) {
    const verifier = randomString(48);
    const state = encodeState(returnPath || window.location.pathname);
    sessionStorage.setItem(VERIFIER_KEY, verifier);
    sessionStorage.setItem(STATE_KEY, state);
    sessionStorage.setItem(RETURN_KEY, returnPath || window.location.pathname);
    const params = new URLSearchParams({
      response_type: "code",
      client_id: CLIENT_ID,
      redirect_uri: redirectUri(),
      code_challenge: await challenge(verifier),
      code_challenge_method: "S256",
      state
    });
    window.location.assign(`https://lichess.org/oauth?${params}`);
  }

  function logout() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(ACCOUNT_CACHE_KEY);
    render(null);
    setText("lichessStatus", "Uitgelogd.");
    window.dispatchEvent(new CustomEvent("lichess-auth-changed", { detail: null }));
  }

  async function finishCallback() {
    const params = new URLSearchParams(window.location.search);
    const statusEl = document.getElementById("status");
    try {
      if (params.get("error")) throw new Error("Lichess-login geannuleerd.");
      if (!params.get("code")) throw new Error("Geen autorisatiecode ontvangen.");
      await exchange(params.get("code"), params.get("state"));
      const returnPath = sessionStorage.getItem(RETURN_KEY) || defaultReturnPath();
      sessionStorage.removeItem(RETURN_KEY);
      window.location.replace(returnPath);
    } catch (error) {
      if (statusEl) {
        statusEl.textContent = error.message;
        statusEl.className = "api-status error";
      }
    }
  }

  async function initialisePage() {
    if (isCallbackPage()) {
      await finishCallback();
      return;
    }
    try {
      const user = await getAccount();
      render(user);
      setText("lichessStatus", user ? `Ingelogd als ${user.username}.` : "Niet ingelogd.");
      window.dispatchEvent(new CustomEvent("lichess-auth-changed", { detail: user }));
    } catch (error) {
      render(null);
      setText("lichessStatus", error.message);
      window.dispatchEvent(new CustomEvent("lichess-auth-changed", { detail: null }));
    }
  }

  window.ScheveTorenAuth = {
    login,
    logout,
    getAccessToken,
    getAccount,
    redirectUri
  };

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("lichessLoginBtn")?.addEventListener("click", () => login(window.location.pathname));
    document.getElementById("lichessLogoutBtn")?.addEventListener("click", logout);
    if (!isCallbackPage()) initialisePage();
    else finishCallback();
  });
})();
