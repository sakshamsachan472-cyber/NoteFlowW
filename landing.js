const featureMenu = document.getElementById("feature-menu");
const featureCards = document.querySelectorAll(".feature-container");
const brandIntro = document.querySelector(".brand-intro");

if (brandIntro) {
  const removeBrandIntro = () => brandIntro.remove();
  brandIntro.addEventListener("animationend", (event) => {
    if (event.animationName === "brand-intro-away") {
      removeBrandIntro(); 
    }
  }, { once: true });
  window.setTimeout(
    removeBrandIntro,
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 50 : 3200 
  ); 
}

featureCards.forEach((card) => {
  const details = card.querySelector(".feature-details");
  const summary = details.querySelector("summary");
  const heading = card.querySelector("h3").textContent.trim();

  details.addEventListener("toggle", () => {
    const action = details.open ? "Hide" : "Show";
    summary.setAttribute("aria-label", `${action} details about ${heading}`);
  });
});

if (featureMenu) {
  featureMenu.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!link || !featureMenu.contains(link)) {
      return;
    }

    event.preventDefault();
    const selectedCategory = link.dataset.category;

    featureCards.forEach((card) => {
      const categories = card.dataset.categories.split(" ");
      card.hidden = selectedCategory !== "all" && !categories.includes(selectedCategory);
    });
    featureMenu.querySelectorAll("a").forEach((menuLink) => {
      if (menuLink === link) {
        menuLink.setAttribute("aria-current", "true");
      } else {
        menuLink.removeAttribute("aria-current");
      }
    });
  });
}

document.querySelectorAll("[data-login-link]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const loginPanel = document.getElementById("login-panel");
    if (!loginPanel || loginPanel.open) {
      return;
    }
    loginPanel.showModal();
    document.getElementById("email").focus();
  });
});

const loginPanel = document.getElementById("login-panel");
if (loginPanel) {
  loginPanel.querySelector("[data-login-close]").addEventListener("click", () => {
    loginPanel.close();
  });

  loginPanel.addEventListener("cancel", () => {
    loginPanel.close();
  });

  loginPanel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      loginPanel.close();
    }
  });

  loginPanel.addEventListener("click", (event) => {
    if (event.target === loginPanel) {
      loginPanel.close();
    }
  });
}

const loginForm = document.getElementById("login-form");
if (loginForm) {
  const SUPABASE_URL = "https://lqtyxouobzircrcoejjz.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_p-MxDS1RmMJLVzUIL8V2fA_VRqoi08d";
  const SESSION_STORAGE_KEY = "noteflow_supabase_session";
  const supabaseAuth = window.supabase && typeof window.supabase.createClient === "function"
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: {
          storageKey: SESSION_STORAGE_KEY,
          flowType: "pkce",
          detectSessionInUrl: false
        }
      })
    : null;
  let authMode = "signin";

  function setAuthMode(mode) {
    authMode = mode;
    const isSignup = mode === "signup";
    document.getElementById("login-mode-signin").classList.toggle("is-active", !isSignup);
    document.getElementById("login-mode-signup").classList.toggle("is-active", isSignup);
    document.getElementById("login-mode-signin").setAttribute("aria-pressed", String(!isSignup));
    document.getElementById("login-mode-signup").setAttribute("aria-pressed", String(isSignup));
    document.getElementById("login-title").textContent = isSignup ? "Create a NoteFlow account" : "Log in to NoteFlow";
    document.querySelector(".login-eyebrow").textContent = isSignup ? "Join NoteFlow" : "Welcome back";
    document.getElementById("login-submit").textContent = isSignup ? "Create account" : "Log in";
    document.getElementById("password").autocomplete = isSignup ? "new-password" : "current-password";
    document.getElementById("username").required = isSignup;
    document.getElementById("username-label").hidden = !isSignup;
    document.getElementById("username").hidden = !isSignup;
    document.getElementById("invite-help").hidden = !isSignup;
    document.getElementById("invite-code").hidden = !isSignup;
    document.querySelector('label[for="invite-code"]').hidden = !isSignup;
    document.getElementById("login-message").textContent = "";
  }

  document.getElementById("login-mode-signin").addEventListener("click", () => setAuthMode("signin"));
  document.getElementById("login-mode-signup").addEventListener("click", () => setAuthMode("signup"));
  setAuthMode("signin");

  function saveSession(session) {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at || Math.floor(Date.now() / 1000) + (session.expires_in || 3600),
      user: session.user
    }));
  }

  const callbackQuery = new URLSearchParams(window.location.search);
  const callbackHash = new URLSearchParams(window.location.hash.slice(1));
  const callbackError = callbackQuery.get("error_description") || callbackQuery.get("error") ||
    callbackHash.get("error_description") || callbackHash.get("error");

  function showOAuthMessage(text) {
    if (!loginPanel.open) loginPanel.showModal();
    setAuthMode("signin");
    document.getElementById("login-message").textContent = text;
  }

  if (callbackError) {
    window.history.replaceState(null, "", window.location.pathname);
    showOAuthMessage(callbackError);
  } else if (callbackQuery.has("code")) {
    (async () => {
      try {
        if (!supabaseAuth) {
          throw new Error("Google sign-in couldn't start because the Supabase client failed to load.");
        }
        const { data, error } = await supabaseAuth.auth.exchangeCodeForSession(callbackQuery.get("code"));
        if (error) throw error;
        if (!data.session) {
          throw new Error("Google sign-in didn't return a session. Check the Supabase redirect URL settings and try again.");
        }
        saveSession(data.session);
        window.location.replace("NoteFlow workspace preview.html");
      } catch (error) {
        window.history.replaceState(null, "", window.location.pathname);
        showOAuthMessage(error.message || "Google sign-in could not be completed.");
      }
    })();
  }

  async function authRequest(path, body) {
    const response = await fetch(`${SUPABASE_URL}${path}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(result && (result.msg || result.message || result.error_description)
        ? (result.msg || result.message || result.error_description)
        : `Supabase returned ${response.status}`);
    }
    return result;
  }

  document.getElementById("google-signin").addEventListener("click", async () => {
    const googleButton = document.getElementById("google-signin");
    const message = document.getElementById("login-message");
    if (!navigator.onLine) {
      message.textContent = "Connect to the internet to sign in with Google.";
      return;
    }
    if (window.location.protocol !== "http:" && window.location.protocol !== "https:") {
      message.textContent = "Open NoteFlow over HTTP or HTTPS before using Google sign-in.";
      return;
    }
    if (!supabaseAuth) {
      message.textContent = "Google sign-in isn't available because the Supabase client failed to load. Check your connection and try again.";
      return;
    }

    googleButton.disabled = true;
    message.textContent = "Redirecting to Google...";
    try {
      const redirectTo = new URL(window.location.href);
      redirectTo.hash = "";
      const { error } = await supabaseAuth.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: redirectTo.toString() }
      });
      if (error) throw error;
    } catch (error) {
      message.textContent = error.message || "Google sign-in could not be started.";
      googleButton.disabled = false;
    }
  });

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const submitButton = document.getElementById("login-submit");
    const message = document.getElementById("login-message");
    submitButton.disabled = true;
    message.textContent = authMode === "signup" ? "Creating your account..." : "Signing in...";

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const username = document.getElementById("username").value.trim();

    (async () => {
      try {
        if (!navigator.onLine) throw new Error("Connect to the internet to access your account.");
        const result = authMode === "signup"
          ? await authRequest("/auth/v1/signup", {
              email,
              password,
              data: { full_name: username }
            })
          : await authRequest("/auth/v1/token?grant_type=password", { email, password });

        if (!result.access_token || !result.user) {
          message.textContent = "Account created. Check your email to confirm it, then log in.";
          loginForm.reset();
          setAuthMode("signin");
          return;
        }

        saveSession(result);
        message.textContent = "Success. Opening your workspace...";
        window.location.href = "NoteFlow workspace preview.html";
      } catch (error) {
        message.textContent = error.message || "The account request could not be completed.";
      } finally {
        submitButton.disabled = false;
      }
    })();
  });
}