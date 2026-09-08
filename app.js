const CONFIG_KEY = "pce-ai-booking-config-v2";
const STORAGE_KEY = "pce-ai-appointments-v2";
const ADMIN_USER = "Miguel";
const ADMIN_PASSWORD = "Miscitasconmike1!";
const API_URL = "https://script.google.com/macros/s/AKfycbx2IHkunHMMSGUNCsaYohEBQp3bAMNG1Y3dWkB3GXax4-xfritQ5fOiUt4ryWOOtzmOMA/exec";

const DEFAULT_CONFIG = {
  purpose: "Evaluación inicial del uso de herramientas de IA",
  description:
    "Queremos entender qué herramientas estás usando, qué te resulta útil y qué bloqueos podemos ayudarte a resolver.",
  startDate: "2026-09-14",
  endDate: "2026-10-09",
  blockedSlots: [{ date: "2026-09-17", turn: "afternoon", reason: "Tarde no disponible" }],
  duration: 60,
  googleForm: {
    enabled: true,
    actionUrl: "https://docs.google.com/forms/d/e/1FAIpQLSc-ajM1P18sbJCV1J7t3o0zJWoL_Ik9q7xE77tEwsj_lFMZcQ/formResponse",
    fields: {
      name: "entry.1855581463",
      role: "entry.1288801672",
      email: "entry.1020080073",
      date: "entry.1482267496",
      time: "entry.199423905",
      purpose: "entry.329651944",
      notes: "entry.2073710110",
    },
  },
};

const MORNING = ["09:00", "10:00", "11:00", "12:00"];
const AFTERNOON = ["16:00", "17:00", "18:00", "19:00"];

let config = loadConfig();
let appointments = loadArray(STORAGE_KEY, []);
let remoteReady = false;
let currentMonday = getMonday(new Date(`${config.startDate}T00:00:00`));
let selected = null;
let adminUnlocked = false;
let selfMatches = [];

const calendar = document.querySelector("#calendar");
const rangeText = document.querySelector("#rangeText");
const purposeTitle = document.querySelector("#purposeTitle");
const purposeDescription = document.querySelector("#purposeDescription");
const selectedSlot = document.querySelector("#selectedSlot");
const bookingForm = document.querySelector("#bookingForm");
const selfForm = document.querySelector("#selfForm");
const selfResults = document.querySelector("#selfResults");
const adminLoginForm = document.querySelector("#adminLoginForm");
const adminPanel = document.querySelector("#adminPanel");
const adminMessage = document.querySelector("#adminMessage");
const appointmentsEl = document.querySelector("#appointments");
const blockedList = document.querySelector("#blockedList");
const purposeInput = document.querySelector("#purposeInput");
const descriptionInput = document.querySelector("#descriptionInput");
const durationSelect = document.querySelector("#duration");
const formMessage = document.querySelector("#formMessage");

document.querySelector("#prevWeek").addEventListener("click", () => changeWeek(-7));
document.querySelector("#nextWeek").addEventListener("click", () => changeWeek(7));
document.querySelector("#today").addEventListener("click", () => {
  currentMonday = getMonday(new Date(`${config.startDate}T00:00:00`));
  render();
loadRemoteAppointments();
});
document.querySelector("#addBlockedSlot").addEventListener("click", addBlockedSlot);
document.querySelector("#savePurpose").addEventListener("click", savePurpose);
document.querySelector("#exportJson").addEventListener("click", exportJson);
document.querySelector("#exportCsv").addEventListener("click", exportCsv);
document.querySelector("#adminLogout").addEventListener("click", () => {
  adminUnlocked = false;
  render();
loadRemoteAppointments();
});

durationSelect.addEventListener("change", () => {
  config.duration = Number(durationSelect.value);
  save(CONFIG_KEY, config);
  render();
loadRemoteAppointments();
});

bookingForm.addEventListener("submit", bookAppointment);
selfForm.addEventListener("submit", findOwnAppointments);
adminLoginForm.addEventListener("submit", unlockAdmin);

render();
loadRemoteAppointments();

function loadRemoteAppointments() {
  const callbackName = `receiveAvailability_${Date.now()}`;
  const script = document.createElement("script");

  window[callbackName] = (data) => {
    appointments = normalizeRemoteAppointments(data.appointments || []);
    remoteReady = true;
    save(STORAGE_KEY, appointments);
    render();
    script.remove();
    delete window[callbackName];
  };

  script.onerror = () => {
    console.warn("No se pudo cargar la disponibilidad de Google Sheets");
    script.remove();
    delete window[callbackName];
  };

  script.src = `${API_URL}?public=availability&callback=${callbackName}&t=${Date.now()}`;
  document.body.appendChild(script);
}

function render() {
  renderConfig();
  renderCalendar();
  renderSelfResults();
  renderAdmin();
}

function renderConfig() {
  purposeTitle.textContent = config.purpose;
  purposeDescription.textContent = config.description;
  rangeText.textContent = `${formatDate(parseDate(config.startDate))} - ${formatDate(parseDate(config.endDate))}`;
  durationSelect.value = String(config.duration);
  purposeInput.value = config.purpose;
  descriptionInput.value = config.description;
}

function renderCalendar() {
  calendar.innerHTML = "";
  const days = Array.from({ length: 5 }, (_, index) => addDays(currentMonday, index));
  const morning = buildSlots(MORNING, config.duration);
  const afternoon = buildSlots(AFTERNOON, config.duration);

  days.forEach((day) => {
    const date = toISO(day);
    const outOfRange = date < config.startDate || date > config.endDate;
    const dayAppointments = appointments.filter((item) => item.date === date);
    const lockedTurn = getLockedTurn(dayAppointments);
    const article = document.createElement("article");
    article.className = "day";
    article.innerHTML = `<h3>${formatDay(day)}</h3><small>${formatDate(day)}</small><div class="slots"></div>`;
    const slots = article.querySelector(".slots");

    [
      ...morning.map((time) => ({ time, turn: "morning" })),
      ...afternoon.map((time) => ({ time, turn: "afternoon" })),
    ].forEach(({ time, turn }) => {
      const booked = appointments.find((item) => item.date === date && item.time === time);
      const blocked = getBlockedSlot(date, turn);
      const blockedByTurn = lockedTurn && lockedTurn !== turn;
      const scheduleBlocked = getScheduleBlock(date, time, turn);
      const disabled = outOfRange || booked || blocked || blockedByTurn || scheduleBlocked;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "slot";
      button.textContent = labelSlot(time, turn, { booked, blocked, blockedByTurn, outOfRange, scheduleBlocked });
      button.disabled = Boolean(disabled);

      if (booked) button.classList.add("booked");
      if (blocked || blockedByTurn || outOfRange || scheduleBlocked) button.classList.add("blocked");
      if (selected && selected.date === date && selected.time === time) button.classList.add("selected");

      button.addEventListener("click", () => selectSlot(date, time, turn));
      slots.appendChild(button);
    });

    calendar.appendChild(article);
  });
}

function renderSelfResults() {
  if (!selfMatches.length) {
    selfResults.innerHTML = '<p class="form-message">Busca tu cita con el mismo nombre y correo usados al reservar.</p>';
    return;
  }

  selfResults.innerHTML = "";
  selfMatches.forEach((item) => selfResults.appendChild(appointmentRow(item, true)));
}

function renderAdmin() {
  adminLoginForm.hidden = adminUnlocked;
  adminPanel.hidden = !adminUnlocked;
  if (!adminUnlocked) return;
  renderAppointments();
  renderBlockedSlots();
}

function renderAppointments() {
  if (!appointments.length) {
    appointmentsEl.innerHTML = '<p class="form-message">Todavía no hay citas reservadas.</p>';
    return;
  }
  appointmentsEl.innerHTML = "";
  appointments
    .slice()
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
    .forEach((item) => appointmentsEl.appendChild(appointmentRow(item, false)));
}

function appointmentRow(item, ownMode) {
  const row = document.createElement("article");
  row.className = "appointment";
  row.innerHTML = `
    <div>
      <strong>${escapeHtml(item.name)}</strong>
      <div>${formatDate(parseDate(item.date))} · ${item.time} · ${item.duration} min</div>
      <small>${escapeHtml(item.role)} · ${escapeHtml(item.email)}</small>
    </div>
    <button type="button" data-action="move">Mover</button>
    <button type="button" class="danger" data-action="cancel">Cancelar</button>
  `;
  row.querySelector('[data-action="move"]').addEventListener("click", () => moveAppointment(item.id, ownMode));
  row.querySelector('[data-action="cancel"]').addEventListener("click", () => cancelAppointment(item.id, ownMode));
  return row;
}

function labelSlot(time, turn, state) {
  const turnLabel = turn === "morning" ? "Mañana" : "Tarde";
  if (state.booked) return `${time} · Reservada`;
  if (state.outOfRange) return `${time} · Fuera de plazo`;
  if (state.blocked) return `${time} · ${state.blocked.reason}`;
  if (state.scheduleBlocked) return `${time} · No disponible`;
  if (state.blockedByTurn) return `${time} · Turno cerrado`;
  return `${time} · ${turnLabel}`;
}

function selectSlot(date, time, turn) {
  selected = { date, time, turn };
  selectedSlot.textContent = `${formatDate(parseDate(date))} a las ${time}`;
  formMessage.textContent = "";
  renderCalendar();
}

function bookAppointment(event) {
  event.preventDefault();
  if (!selected) {
    formMessage.textContent = "Selecciona primero una hora disponible en el calendario.";
    return;
  }

  const appointment = {
    id: crypto.randomUUID(),
    ...selected,
    purpose: config.purpose,
    duration: config.duration,
    name: bookingForm.elements.name.value.trim(),
    role: bookingForm.elements.role.value.trim(),
    email: bookingForm.elements.email.value.trim().toLowerCase(),
    notes: bookingForm.elements.notes.value.trim(),
    createdAt: new Date().toISOString(),
  };

  appointments.push(appointment);
  save(STORAGE_KEY, appointments);
  createRemoteAppointment(appointment);
  bookingForm.reset();
  formMessage.innerHTML = '<span class="ok">Cita guardada</span>';
  selected = null;
  selectedSlot.textContent = "Sin seleccionar";
  render();
loadRemoteAppointments();
}

function findOwnAppointments(event) {
  event.preventDefault();
  const name = selfForm.elements.selfName.value.trim();
  const email = selfForm.elements.selfEmail.value.trim().toLowerCase();
  selfResults.innerHTML = '<p class="form-message">Buscando tu cita...</p>';
  loadOwnAppointments(name, email);
}

function loadOwnAppointments(name, email) {
  const callbackName = `receiveOwnAppointments_${Date.now()}`;
  const script = document.createElement("script");

  window[callbackName] = (data) => {
    selfMatches = normalizeRemoteAppointments(data.appointments || []);
    renderSelfResults();
    script.remove();
    delete window[callbackName];
  };

  script.onerror = () => {
    selfResults.innerHTML = '<p class="form-message danger">No se pudo consultar la cita. Inténtalo de nuevo.</p>';
    script.remove();
    delete window[callbackName];
  };

  const params = new URLSearchParams({
    action: "self",
    name,
    email,
    callback: callbackName,
    t: String(Date.now()),
  });
  script.src = `${API_URL}?${params.toString()}`;
  document.body.appendChild(script);
}

function moveAppointment(id, ownMode) {
  const item = appointments.find((appointment) => appointment.id === id);
  if (!selected) {
    formMessage.textContent = "Selecciona en el calendario la nueva hora y después pulsa Mover en tu cita.";
    return;
  }
  Object.assign(item, selected, { duration: config.duration });
  save(STORAGE_KEY, appointments);
  updateRemoteAppointment(item);
  selected = null;
  selectedSlot.textContent = "Sin seleccionar";
  formMessage.textContent = "Cita movida correctamente.";
  if (ownMode) refreshSelfMatches();
  render();
loadRemoteAppointments();
}

function cancelAppointment(id, ownMode) {
  appointments = appointments.filter((item) => item.id !== id);
  save(STORAGE_KEY, appointments);
  cancelRemoteAppointment(id);
  if (ownMode) refreshSelfMatches();
  render();
loadRemoteAppointments();
}

async function createRemoteAppointment(appointment) {
  await postRemote({ action: "create", ...appointment });
}

async function updateRemoteAppointment(appointment) {
  await postRemote({ action: "move", ...appointment });
}

async function cancelRemoteAppointment(id) {
  await postRemote({ action: "cancel", id });
}

async function postRemote(payload) {
  try {
    await fetch(API_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.warn("No se pudo sincronizar con Google Sheets", error);
  }
}

function unlockAdmin(event) {
  event.preventDefault();
  const user = adminLoginForm.elements.adminUser.value.trim();
  const password = adminLoginForm.elements.adminPassword.value;
  adminUnlocked = user === ADMIN_USER && password === ADMIN_PASSWORD;
  adminMessage.textContent = adminUnlocked ? "" : "Usuario o contraseña no válidos.";
  render();
loadRemoteAppointments();
}

function savePurpose() {
  config.purpose = purposeInput.value.trim() || DEFAULT_CONFIG.purpose;
  config.description = descriptionInput.value.trim() || DEFAULT_CONFIG.description;
  save(CONFIG_KEY, config);
  render();
loadRemoteAppointments();
}

function addBlockedSlot() {
  const date = document.querySelector("#blockedDate").value;
  const turn = document.querySelector("#blockedTurn").value;
  if (!date || config.blockedSlots.some((item) => item.date === date && item.turn === turn)) return;
  config.blockedSlots.push({ date, turn, reason: turn === "morning" ? "Mañana no disponible" : "Tarde no disponible" });
  save(CONFIG_KEY, config);
  render();
loadRemoteAppointments();
}

function renderBlockedSlots() {
  blockedList.innerHTML = "";
  config.blockedSlots
    .slice()
    .sort((a, b) => `${a.date}${a.turn}`.localeCompare(`${b.date}${b.turn}`))
    .forEach((blocked) => {
      const item = document.createElement("div");
      item.className = "blocked-item";
      item.innerHTML = `<strong>${formatDate(parseDate(blocked.date))}</strong><span>${blocked.turn === "morning" ? "Mañana" : "Tarde"}</span>`;
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Liberar";
      button.addEventListener("click", () => {
        config.blockedSlots = config.blockedSlots.filter((slot) => slot !== blocked);
        save(CONFIG_KEY, config);
        render();
loadRemoteAppointments();
      });
      item.appendChild(button);
      blockedList.appendChild(item);
    });
}

function getLockedTurn(dayAppointments) {
  if (!dayAppointments.length) return null;
  return dayAppointments[0].turn;
}

function getBlockedSlot(date, turn) {
  return config.blockedSlots.find((item) => item.date === date && item.turn === turn);
}

function getScheduleBlock(date, time, turn) {
  const day = parseDate(date).getDay();
  if (day === 5 && turn === "afternoon") return true;
  if ((day === 3 || day === 4) && turn === "afternoon" && time >= "18:00") return true;
  return false;
}

function buildSlots(baseHours, duration) {
  if (duration === 60) return baseHours;
  const result = [];
  const end = addMinutes(baseHours.at(-1), 60);
  let cursor = baseHours[0];
  while (cursor < end) {
    result.push(cursor);
    cursor = addMinutes(cursor, duration);
  }
  return result;
}

function exportCsv() {
  const headers = ["Fecha", "Hora", "Duración", "Nombre", "Puesto", "Correo", "Tipo de cita", "Comentario", "Creada el"];
  const rows = appointments
    .slice()
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
    .map((item) => [
      item.date,
      item.time,
      item.duration,
      item.name,
      item.role,
      item.email,
      item.purpose,
      item.notes,
      item.createdAt,
    ]);
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
  downloadFile("citas-ia-grupo-escuela-pce.csv", `\uFEFF${csv}`, "text/csv;charset=utf-8");
}
function exportJson() {
  const data = JSON.stringify({ config, appointments }, null, 2);
  downloadFile("citas-ia-grupo-escuela-pce.json", data, "application/json");
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = String(value ?? "").replace(/"/g, '""');
  return `"${text}"`;
}
function normalizeRemoteAppointments(rows) {
  return rows
    .map((row) => {
      const date = normalizeDateValue(row.fecha || row.Fecha);
      const time = normalizeTimeValue(row.hora || row.Hora);
      if (!date || !time) return null;
      return {
        id: String(row.id || crypto.randomUUID()),
        date,
        time,
        turn: row.turno || inferTurn(time),
        duration: Number(row.duracion || row.Duracion || row["Duración"] || config.duration),
        name: String(row.nombre || row["Nombre y apellidos"] || ""),
        role: String(row.puesto || row.Puesto || ""),
        email: String(row.email || row["Correo electrónico"] || "").toLowerCase(),
        purpose: String(row.tipo_cita || row["Tipo de cita"] || config.purpose),
        notes: String(row.comentario || row["Comentario opcional"] || ""),
        createdAt: String(row.creada_el || row["Marca temporal"] || ""),
      };
    })
    .filter(Boolean);
}

function normalizeDateValue(value) {
  if (!value) return "";
  if (value instanceof Date) return toISO(value);
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const match = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return text.slice(0, 10);
}

function normalizeTimeValue(value) {
  if (!value) return "";
  const text = String(value);
  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (match) return `${match[1].padStart(2, "0")}:${match[2]}`;
  return text;
}

function inferTurn(time) {
  return time < "14:00" ? "morning" : "afternoon";
}

function refreshSelfMatches() {
  const ids = new Set(selfMatches.map((item) => item.id));
  selfMatches = appointments.filter((item) => ids.has(item.id));
}

function getMonday(date) {
  const result = new Date(date);
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function changeWeek(days) {
  currentMonday = addDays(currentMonday, days);
  selected = null;
  selectedSlot.textContent = "Sin seleccionar";
  render();
loadRemoteAppointments();
}

function addMinutes(time, minutes) {
  const [hours, mins] = time.split(":").map(Number);
  const date = new Date(2000, 0, 1, hours, mins + minutes);
  return date.toTimeString().slice(0, 5);
}

function parseDate(value) {
  return new Date(`${value}T00:00:00`);
}

function toISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDay(date) {
  return new Intl.DateTimeFormat("es-ES", { weekday: "long" }).format(date);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function normalize(value) {
  return value.trim().toLowerCase();
}

function loadConfig() {
  try {
    const stored = JSON.parse(localStorage.getItem(CONFIG_KEY));
    return stored ? { ...DEFAULT_CONFIG, ...stored } : { ...DEFAULT_CONFIG };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function loadArray(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
  });
}











