const ACCESS_KEY = "pson5_console_access";

const button = document.querySelector("#enter-console");

button?.addEventListener("click", () => {
  sessionStorage.setItem(ACCESS_KEY, "granted");
  window.location.href = "/console";
});
