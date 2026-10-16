(function () {
  function setStatus(el, text, ok) {
    if (!el) return;
    el.textContent = text;
    el.className = `api-status ${ok === true ? "ok" : ok === false ? "error" : ""}`;
  }

  function init() {
    const form = document.getElementById("contactForm");
    const statusEl = document.getElementById("contactFormStatus");
    if (!form || !window.ScheveTorenApi?.postJson) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      const name = String(data.name || "").trim();
      const email = String(data.email || "").trim();
      const message = String(data.message || "").trim();
      if (!name || !email || !message) {
        setStatus(statusEl, "Vul naam, e-mail en bericht in.", false);
        return;
      }

      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      setStatus(statusEl, "Versturen…");

      try {
        const result = await window.ScheveTorenApi.postJson(
          {
            action: "contact-form",
            name,
            email,
            subject: String(data.subject || "").trim(),
            message,
            website: String(data.website || "")
          },
          { retries: 0, timeoutMs: 20000 }
        );
        if (!result.ok) {
          throw Error(result.message || result.error || "Versturen mislukt");
        }
        form.reset();
        setStatus(statusEl, "Bedankt! Je bericht is verstuurd.", true);
      } catch (error) {
        const msg = String(error.message || error);
        const friendly = {
          missing_fields: "Vul naam, e-mail en bericht in.",
          invalid_contact: "Controleer je e-mailadres en de lengte van de velden.",
          rate_limited: "Je hebt zojuist een bericht gestuurd. Probeer het zo opnieuw.",
          contact_email_not_configured: "E-mail is tijdelijk niet beschikbaar. Probeer later of mail het bestuur direct.",
          contact_send_failed: "Versturen mislukt. Probeer het later opnieuw."
        };
        setStatus(statusEl, friendly[msg] || msg || "Versturen mislukt.", false);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
