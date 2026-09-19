/* Browser-only Lichess OAuth login using Authorization Code + PKCE.
 * This establishes a local login for the UI. The attendance API is not protected yet.
 */
(() => {
  const CLIENT_ID = "schevetoren-site";
  const TOKEN_KEY = "schevetoren_lichess_token";
  const VERIFIER_KEY = "schevetoren_lichess_verifier";
  const STATE_KEY = "schevetoren_lichess_state";
  const REDIRECT_URI = `${window.location.origin}${window.location.pathname}`;

  const base64Url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const randomString = length => {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return base64Url(bytes);
  };
  async function challenge(verifier) {
    return base64Url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  }
  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }
  function token() { return sessionStorage.getItem(TOKEN_KEY); }
  function clearCallbackUrl() {
    window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.hash}`);
  }
  async function login() {
    const verifier = randomString(48);
    const state = randomString(24);
    sessionStorage.setItem(VERIFIER_KEY, verifier);
    sessionStorage.setItem(STATE_KEY, state);
    const params = new URLSearchParams({
      response_type: "code", client_id: CLIENT_ID, redirect_uri: REDIRECT_URI,
      code_challenge: await challenge(verifier), code_challenge_method: "S256", state
    });
    window.location.assign(`https://lichess.org/oauth?${params}`);
  }
  async function exchange(code, returnedState) {
    if (sessionStorage.getItem(STATE_KEY) !== returnedState || !sessionStorage.getItem(VERIFIER_KEY)) {
      throw new Error("Ongeldige OAuth state. Probeer opnieuw in te loggen.");
    }
    const body = new URLSearchParams({
      grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID, code_verifier: sessionStorage.getItem(VERIFIER_KEY)
    });
    const response = await fetch("https://lichess.org/api/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body
    });
    if (!response.ok) throw new Error("Lichess-login mislukt.");
    const result = await response.json();
    if (!result.access_token) throw new Error("Geen toegangstoken ontvangen.");
    sessionStorage.setItem(TOKEN_KEY, result.access_token);
    sessionStorage.removeItem(VERIFIER_KEY);
    sessionStorage.removeItem(STATE_KEY);
    clearCallbackUrl();
  }
  async function account() {
    if (!token()) return null;
    const response = await fetch("https://lichess.org/api/account", { headers: { Authorization: `Bearer ${token()}` } });
    if (!response.ok) { sessionStorage.removeItem(TOKEN_KEY); return null; }
    return response.json();
  }
  function render(user) {
    const loginButton = document.getElementById("lichessLoginBtn");
    const logoutButton = document.getElementById("lichessLogoutBtn");
    const userLabel = document.getElementById("lichessUser");
    if (loginButton) loginButton.hidden = Boolean(user);
    if (logoutButton) logoutButton.hidden = !user;
    if (userLabel) { userLabel.hidden = !user; userLabel.textContent = user ? `Ingelogd als ${user.username}` : ""; }
  }
  async function initialise() {
    const params = new URLSearchParams(window.location.search);
    try {
      if (params.get("error")) throw new Error("Lichess-login geannuleerd.");
      if (params.get("code")) await exchange(params.get("code"), params.get("state"));
      const user = await account();
      render(user);
      setText("lichessStatus", user ? `Ingelogd als ${user.username}.` : "Niet ingelogd.");
      window.dispatchEvent(new CustomEvent("lichess-auth-changed", { detail: user }));
    } catch (error) {
      render(null); setText("lichessStatus", error.message);
      window.dispatchEvent(new CustomEvent("lichess-auth-changed", { detail: null }));
    }
  }
  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("lichessLoginBtn")?.addEventListener("click", login);
    document.getElementById("lichessLogoutBtn")?.addEventListener("click", () => {
      sessionStorage.removeItem(TOKEN_KEY); render(null); setText("lichessStatus", "Uitgelogd.");
      window.dispatchEvent(new CustomEvent("lichess-auth-changed", { detail: null }));
    });
    initialise();
  });
})();
