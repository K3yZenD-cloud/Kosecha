const form = document.getElementById("login-form");
const errorBox = document.getElementById("error");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorBox.hidden = true;

  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      errorBox.textContent = data.error || "No se pudo iniciar sesión.";
      errorBox.hidden = false;
      return;
    }
    window.location.href = "./";
  } catch (e) {
    errorBox.textContent = "No se pudo conectar con el servidor.";
    errorBox.hidden = false;
  }
});
