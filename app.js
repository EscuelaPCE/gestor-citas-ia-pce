const STORAGE_KEY = "pce-ai-appointments-v2";
const API_URL = "https://script.google.com/macros/s/AKfycbx2IHkunHMMSGUNCsaYohEBQp3bAMNG1Y3dWkB3GXax4-xfritQ5fOiUt4ryWOOtzmOMA/exec";

const CONFIG = {
  purpose: "Evaluación inicial del uso de herramientas de IA",
  description: "Queremos entender qué herramientas estás usando, qué te resulta útil y qué bloqueos podemos ayudarte a resolver.",
  startDate: "2026-09-14",
  endDate: "2026-10-09",
  duration: 60,
  blockedSlots: [{ date: "2026-09-17", turn: "afternoon", reason: "Tarde no disponible" }],
};

const MORNING = ["09:00", "10:00", "11:00", "12:00"];
const AFTERNOON = ["16:00", "17:00", "18:00", "19:00"];

let appointments = loadArray(STORAGE_KEY, []);
let currentMonday = getMonday(parseDate(CONFIG.startDate));
let selected = null;
let selfMatches = [];

const calendar = document.querySelector("#calendar");
const rangeText = document.querySelector("#rangeText");
const purposeTitle = document.querySelector("#purposeTitle");
const purposeDescription = document.querySelector("#purposeDescription");
const selectedSlot = document.querySelector("#selectedSlot");
const bookingForm = document.querySelector("#bookingForm");
const selfForm = document.querySelector("#selfForm");
const selfResults = document.querySelector("#selfResults");
const formMessage = document.querySelector("#formMessage");

document.querySelector("#prevWeek").addEventListener("click", () => changeWeek(-7));
document.querySelector("#nextWeek").addEventListener("click", () => changeWeek(7));
document.querySelector("#today").addEventListener("click", () => {
  currentMonday = getMonday(parseDate(CONFIG.startDate));
  render();
  loadRemoteAppointments();
});

bookingForm.addEventListener("submit", bookAppointment);
selfForm.addEventListener("submit", findOwnAppointments);

render();
loadRemoteAppointments();

function loadRemoteAppointments() {
  loadJsonp({ public: "availability" }, (data) => {
    appointments = normalizeRemoteAppointments(data.appointments || []);
    save(STORAGE_KEY, appointments);
    render();
  }, "No se pudo cargar la disponibilidad de Google Sheets");
}

function render() {
  renderConfig();
  renderCalendar();
  renderSelfResults();
}

function renderConfig() {
  purposeTitle.textContent = CONFIG.purpose;
  purposeDescription.textContent = CONFIG.description;
  rangeText.textContent = `${formatDate(parseDate(CONFIG.startDate))} - ${formatDate(parseDate(CONFIG.endDate))}`;
}

function renderCalendar() {
  calendar.innerHTML = "";
  const days = Array.from({ length: 5 }, (_, index) => addDays(currentMonday, index));

  days.forEach((day) => {
    const date = toISO(day);
    const outOfRange = date < CONFIG.startDate || date > CONFIG.endDate;
    const dayAppointments = appointments.filter((item) => item.date === date);
    const lockedTurn = getLockedTurn(dayAppointments);
    const article = document.createElement("article");
    article.className = "day";
    article.innerHTML = `<h3>${formatDay(day)}</h3><small>${formatDate(day)}</small><div class="slots"></div>`;
    const slots = article.querySelector(".slots");

    [
      ...MORNING.map((time) => ({ time, turn: "morning" })),
      ...AFTERNOON.map((time) => ({ time, turn: "afternoon" })),
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
  selfMatches.forEach((item) => selfResults.appendChild(appointmentRow(item)));
}

function appointmentRow(item) {
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
  row.querySelector('[data-action="move"]').addEventListener("click", () => moveAppointment(item.id));
  row.querySelector('[data-action="cancel"]').addEventListener("click", () => cancelAppointment(item.id));
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

  if (appointments.some((item) => item.date === selected.date && item.time === selected.time)) {
    formMessage.textContent = "Ese hueco ya aparece como reservado. Elige otra hora.";
    selected = null;
    selectedSlot.textContent = "Sin seleccionar";
    render();
    return;
  }

  const appointment = {
    id: crypto.randomUUID(),
    ...selected,
    purpose: CONFIG.purpose,
    duration: CONFIG.duration,
    name: bookingForm.elements.name.value.trim(),
    role: bookingForm.elements.role.value.trim(),
    email: bookingForm.elements.email.value.trim().toLowerCase(),
    notes: bookingForm.elements.notes.value.trim(),
    createdAt: new Date().toISOString(),
  };

  appointments.push(appointment);
  save(STORAGE_KEY, appointments);
  postRemote({ action: "create", ...appointment });
  bookingForm.reset();
  formMessage.innerHTML = '<span class="ok">Cita guardada</span>';
  selected = null;
  selectedSlot.textContent = "Sin seleccionar";
  render();
  setTimeout(loadRemoteAppointments, 1200);
}

function findOwnAppointments(event) {
  event.preventDefault();
  const name = selfForm.elements.selfName.value.trim();
  const email = selfForm.elements.selfEmail.value.trim().toLowerCase();
  selfResults.innerHTML = '<p class="form-message">Buscando tu cita...</p>';

  loadJsonp({ action: "self", name, email }, (data) => {
    selfMatches = normalizeRemoteAppointments(data.appointments || []);
    renderSelfResults();
  }, "No se pudo consultar la cita. Inténtalo de nuevo.");
}

function moveAppointment(id) {
  const item = selfMatches.find((appointment) => appointment.id === id);
  if (!selected) {
    formMessage.textContent = "Selecciona en el calendario la nueva hora y después pulsa Mover en tu cita.";
    return;
  }

  Object.assign(item, selected, { duration: CONFIG.duration });
  postRemote({ action: "move", ...item });
  selected = null;
  selectedSlot.textContent = "Sin seleccionar";
  formMessage.textContent = "Cita movida correctamente.";
  render();
  setTimeout(() => {
    loadRemoteAppointments();
    refreshSelfMatches();
  }, 1200);
}

function cancelAppointment(id) {
  selfMatches = selfMatches.filter((item) => item.id !== id);
  postRemote({ action: "cancel", id });
  render();
  setTimeout(loadRemoteAppointments, 1200);
}

function loadJsonp(params, onSuccess, errorMessage) {
  const callbackName = `callback_${Date.now()}_${Math.round(Math.random() * 100000)}`;
  const script = document.createElement("script");

  window[callbackName] = (data) => {
    onSuccess(data);
    script.remove();
    delete window[callbackName];
  };

  script.onerror = () => {
    console.warn(errorMessage);
    script.remove();
    delete window[callbackName];
    if (errorMessage.includes("consultar")) {
      selfResults.innerHTML = `<p class="form-message danger">${errorMessage}</p>`;
    }
  };

  const query = new URLSearchParams({ ...params, callback: callbackName, t: String(Date.now()) });
  script.src = `${API_URL}?${query.toString()}`;
  document.body.appendChild(script);
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

function refreshSelfMatches() {
  const name = selfForm.elements.selfName.value.trim();
  const email = selfForm.elements.selfEmail.value.trim().toLowerCase();
  if (!name || !email) return;
  loadJsonp({ action: "self", name, email }, (data) => {
    selfMatches = normalizeRemoteAppointments(data.appointments || []);
    renderSelfResults();
  }, "No se pudo consultar la cita. Inténtalo de nuevo.");
}

function getLockedTurn(dayAppointments) {
  if (!dayAppointments.length) return null;
  return dayAppointments[0].turn;
}

function getBlockedSlot(date, turn) {
  return CONFIG.blockedSlots.find((item) => item.date === date && item.turn === turn);
}

function getScheduleBlock(date, time, turn) {
  const day = parseDate(date).getDay();
  if (day === 5 && turn === "afternoon") return true;
  if ((day === 3 || day === 4) && turn === "afternoon" && time >= "18:00") return true;
  return false;
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
        duration: Number(row.duracion || row.Duracion || row["Duración"] || CONFIG.duration),
        name: String(row.nombre || row["Nombre y apellidos"] || ""),
        role: String(row.puesto || row.Puesto || ""),
        email: String(row.email || row["Correo electrónico"] || "").toLowerCase(),
        purpose: String(row.tipo_cita || row["Tipo de cita"] || CONFIG.purpose),
        notes: String(row.comentario || row["Comentario opcional"] || ""),
        createdAt: String(row.creada_el || row["Marca temporal"] || ""),
      };
    })
    .filter(Boolean);
}

function normalizeDateValue(value) {
  if (!value) return "";
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return toISO(new Date(text));
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const match = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return text.slice(0, 10);
}

function normalizeTimeValue(value) {
  if (!value) return "";
  const text = String(value);
  const cleanMatch = text.match(/^(\d{1,2}):(\d{2})/);
  if (cleanMatch) return `${cleanMatch[1].padStart(2, "0")}:${cleanMatch[2]}`;
  const exactSlot = [...MORNING, ...AFTERNOON].find((slot) => text.includes(`T${slot}`) || text.includes(` ${slot}`));
  if (exactSlot) return exactSlot;
  const isoMatch = text.match(/T(\d{2}):(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}:${isoMatch[2]}`;
  return text;
}

function inferTurn(time) {
  return time < "14:00" ? "morning" : "afternoon";
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
  return String(value || "").replace(/[&<>"']/g, (char) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
  });
}
