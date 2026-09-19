/**
 * Shared handler for the signup and login forms.
 * Posts the form as JSON to the given endpoint and redirects to the
 * task board on success, or shows the server's error message.
 */

function initAuthForm(formId, endpoint) {
  const form = document.getElementById(formId);
  const errorEl = document.getElementById("auth-error");
  const passwordEl = form.querySelector("#password");
  const passwordErrorEl = form.querySelector("#password-error");
  const passwordToggleEl = form.querySelector(".password-toggle");
  const eyeIconEl = passwordToggleEl.querySelector(".eye-icon");
  let showPassword = false;
  const emailEl = form.querySelector("#email");
  const emailErrorEl = form.querySelector("#email-error");

  const setFieldError = (inputEl, errorEl, message) => {
    errorEl.textContent = message;
    errorEl.hidden = !message;
    inputEl.setAttribute("aria-invalid", String(Boolean(message)));
  };

  const validatePassword = () => {
    const password = passwordEl.value;
    if (formId === "signup-form") {
      const isValid = password.length >= 8
        && /[A-Z]/.test(password)
        && /[a-z]/.test(password)
        && /[0-9]/.test(password)
        && /[!@#$%^&*]/.test(password);
      const message = isValid
        ? "Strong password ✓"
        : "Password must be at least 8 characters and include an uppercase letter, lowercase letter, number, and special character.";

      passwordErrorEl.textContent = message;
      passwordErrorEl.hidden = false;
      passwordErrorEl.classList.toggle("field-success", isValid);
      passwordErrorEl.classList.toggle("field-error", !isValid);
      passwordEl.setAttribute("aria-invalid", String(!isValid));
      return isValid;
    }

    const message = password ? "" : "Password is required.";
    setFieldError(passwordEl, passwordErrorEl, message);
    return !message;
  };

  const validateEmail = () => {
    if (!emailEl) return true;
    const email = emailEl.value.trim();
    const message = email && email.includes("@") && email.includes(".")
      ? ""
      : "Please enter a valid email address.";
    setFieldError(emailEl, emailErrorEl, message);
    return !message;
  };

  const updatePasswordVisibility = () => {
    passwordEl.type = showPassword ? "text" : "password";
    passwordToggleEl.setAttribute("aria-label", showPassword ? "Hide password" : "Show password");
    passwordToggleEl.setAttribute("aria-pressed", String(showPassword));
    eyeIconEl.innerHTML = showPassword
      ? '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.5" stroke="currentColor" stroke-width="1.8"/>'
      : '<path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.3A10.8 10.8 0 0 1 12 4c5 0 8.7 4 10 8-.4 1.2-1 2.3-1.8 3.3M6.2 6.2C4.6 7.3 3.5 9 2 12c1.3 4 5 8 10 8 1.5 0 2.8-.3 4-.9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
  };

  passwordToggleEl.addEventListener("click", () => {
    showPassword = !showPassword;
    updatePasswordVisibility();
    passwordEl.focus();
  });
  updatePasswordVisibility();

  passwordEl.addEventListener("input", validatePassword);
  if (emailEl) emailEl.addEventListener("input", validateEmail);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.hidden = true;

    const isValid = validatePassword() && validateEmail();
    if (!isValid) return;

    const payload = {};
    new FormData(form).forEach((value, key) => (payload[key] = value));

    const submitBtn = form.querySelector("button[type='submit']");
    submitBtn.disabled = true;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      window.location.href = "/";
    } catch (err) {
      if (formId === "login-form") {
        setFieldError(passwordEl, passwordErrorEl, err.message);
      } else {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
      submitBtn.disabled = false;
    }
  });
}
