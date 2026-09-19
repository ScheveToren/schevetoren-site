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
    const data = new TextEncoder().encode(verifier);
    return base64Url(await crypto.subtle.digest("SHA-256", data));
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function token() {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  function clearCallbackUrl() {
    const clean = `${window.location.pathname}${window.location.hash}`;
    window.history.replaceState({}, document.title, clean);
  }

  async function login() {
    const verifier = randomString(48);
    const state = randomString(24);
    sessionStorage.setItem(VERIFIER_KEY, verifier);
    sessionStorage.setItem(STATE_KEY, state);
    const params = new URLSearchParams({
      response_type: "code",
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      code_challenge: await challenge(verifier),
      code_challenge_method: "S256",
      state
    });
    window.location.assign(`https://lichess.org/oauth?${params}`);
  }

  async function exchange(code, returnedState) {
    const expectedState = sessionStorage.getItem(STATE_KEY);
    const verifier = sessionStorage.getItem(VERIFIER_KEY);
    if (!verifier || !expectedState || returnedState !== expectedState) {
      throw new Error("Ongeldige OAuth state. Probeer opnieuw in te loggen.");
    }

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: verifier
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
    clearCallbackUrl();
  }

  async function account() {
    const accessToken = token();
    if (!accessToken) return null;
    const response = await fetch("https://lichess.org/api/account", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) {
      sessionStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return response.json();
  }

  function render(user) {
    const loginButton = document.getElementById("lichessLoginBtn");
    const logoutButton = document.getElementById("lichessLogoutBtn");
    const userLabel = document.getElementById("lichessUser");
    if (!loginButton) return;
    const loggedIn = Boolean(user);
    loginButton.hidden = loggedIn;
    if (logoutButton) logoutButton.hidden = !loggedIn;
    if (userLabel) {
      userLabel.hidden = !loggedIn;
      userLabel.textContent = loggedIn ? `Ingelogd als ${user.username}` : "";
    }
  }

  async function initialise() {
    const params = new URLSearchParams(window.location.search);
    try {
      if (params.get("error")) throw new Error("Lichess-login geannuleerd.");
      if (params.get("code")) await exchange(params.get("code"), params.get("state"));
      const user = await account();
      render(user);
      if (user) setText("lichessStatus", `Ingelogd als ${user.username}.`);
      else setText("lichessStatus", "Niet ingelogd.");
    } catch (error) {
      render(null);
      setText("lichessStatus", error.message);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const loginButton = document.getElementById("lichessLoginBtn");
    const logoutButton = document.getElementById("lichessLogoutBtn");
    if (loginButton) loginButton.addEventListener("click", login);
    if (logoutButton) logoutButton.addEventListener("click", () => {
      sessionStorage.removeItem(TOKEN_KEY);
      render(null);
      setText("lichessStatus", "Uitgelogd.");
    });
    initialise();
  });
})();
