const STORAGE_KEY = "mesaimatik-kayitlari";
const SETTINGS_KEY = "mesaimatik-kisisel-ayarlar";

const $ = (id) => document.getElementById(id);

let records = [];
let settings = null;

try {
  const savedRecords = JSON.parse(localStorage.getItem(STORAGE_KEY));
  records = Array.isArray(savedRecords) ? savedRecords : [];
} catch {
  records = [];
}

try {
  const savedSettings = JSON.parse(localStorage.getItem(SETTINGS_KEY));

  if (
    savedSettings &&
    Number(savedSettings.salary) > 0 &&
    Number(savedSettings.weeklyHours) > 0 &&
    ["net", "gross"].includes(savedSettings.salaryType) &&
    ["normal", "shift"].includes(savedSettings.workMode)
  ) {
    settings = savedSettings;
  }
} catch {
  settings = null;
}

function saveRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function money(value) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2
  }).format(value);
}

function durationText(hours) {
  const minutes = Math.max(0, Math.round(hours * 60));
  return `${Math.floor(minutes / 60)} sa ${String(minutes % 60).padStart(2, "0")} dk`;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(`${date}T12:00:00`));
}

function getNumber(id, fallback = 0) {
  const value = Number($(id).value);
  return Number.isFinite(value) ? value : fallback;
}

function getWorkedHours(start, end) {
  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);

  let startMinutes = startH * 60 + startM;
  let endMinutes = endH * 60 + endM;

  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }

  return (endMinutes - startMinutes) / 60;
}

function readSettingsForm() {
  return {
    salaryType: $("salaryType").value,
    salary: getNumber("salary"),
    workMode: $("workMode").value,
    weeklyHours: getNumber("weeklyHours"),
    overtimeMultiplier: getNumber("overtimeMultiplier"),
    weekendMultiplier: getNumber("weekendMultiplier"),
    holidayMultiplier: getNumber("holidayMultiplier")
  };
}

function validSettings(config) {
  return (
    ["net", "gross"].includes(config.salaryType) &&
    config.salary > 0 &&
    ["normal", "shift"].includes(config.workMode) &&
    config.weeklyHours > 0 &&
    config.weeklyHours <= 168 &&
    config.overtimeMultiplier >= 1 &&
    config.weekendMultiplier >= 1 &&
    config.holidayMultiplier >= 1 &&
    Number.isFinite(config.salary) &&
    Number.isFinite(config.weeklyHours) &&
    Number.isFinite(config.overtimeMultiplier) &&
    Number.isFinite(config.weekendMultiplier) &&
    Number.isFinite(config.holidayMultiplier)
  );
}

function fillSettingsForm(config) {
  $("salaryType").value = config.salaryType;
  $("salary").value = config.salary;
  $("workMode").value = config.workMode;
  $("weeklyHours").value = config.weeklyHours;
  $("overtimeMultiplier").value = config.overtimeMultiplier;
  $("weekendMultiplier").value = config.weekendMultiplier;
  $("holidayMultiplier").value = config.holidayMultiplier;
}

function saveSettings(config) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(config));
    settings = config;

    $("settingsMessage").textContent = "Ayarların bu cihaza kaydedildi.";
    $("appContent").hidden = false;

    render();
  } catch {
    $("settingsMessage").textContent =
      "Ayarlar kaydedilemedi. Tarayıcının depolama alanını kontrol et.";
  }
}

function weekKey(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  const day = (date.getDay() + 6) % 7;

  date.setDate(date.getDate() - day);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function calculateRecords(monthRecords, config) {
  const sorted = [...monthRecords].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  const weeklyTotals = new Map();

  sorted.forEach(record => {
    const key = weekKey(record.date);
    weeklyTotals.set(key, (weeklyTotals.get(key) || 0) + record.hours);
  });

  const extraByRecord = new Map();

  weeklyTotals.forEach((total, key) => {
    const weekRecords = sorted.filter(
      record => weekKey(record.date) === key
    );

    let extraLeft = Math.max(0, total - config.weeklyHours);

    for (let i = weekRecords.length - 1; i >= 0; i--) {
      const record = weekRecords[i];
      const extra = Math.min(record.hours, extraLeft);

      extraByRecord.set(record.id, extra);
      extraLeft -= extra;
    }
  });

  const hourlyRate = config.salary / 225;
  let totalHours = 0;
  let totalExtraHours = 0;
  let totalExtraPay = 0;

  const results = sorted.map(record => {
    const extraHours = extraByRecord.get(record.id) || 0;
    let multiplier = config.overtimeMultiplier;

    if (record.dayType === "weekend") {
      multiplier = config.weekendMultiplier;
    } else if (record.dayType === "holiday") {
      multiplier = config.holidayMultiplier;
    }

    const extraPay = extraHours * hourlyRate * multiplier;

    totalHours += record.hours;
    totalExtraHours += extraHours;
    totalExtraPay += extraPay;

    return { record, extraHours, extraPay };
  });

  return { results, totalHours, totalExtraHours, totalExtraPay };
}

function getVisibleRecords() {
  const month = $("reportMonth").value;

  return records
    .filter(record => !month || record.date.startsWith(month))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function render() {
  if (!settings) return;

  const visible = getVisibleRecords();
  const calculation = calculateRecords(visible, settings);
  const tbody = $("recordsBody");

  tbody.innerHTML = "";

  calculation.results.forEach(({ record, extraHours, extraPay }) => {
    const row = document.createElement("tr");

    const cells = [
      formatDate(record.date),
      `${record.start}–${record.end}${record.note ? " · " + record.note : ""}`,
      durationText(record.hours),
      durationText(extraHours)
    ];

    cells.forEach(value => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    });

    const typeCell = document.createElement("td");
    const pill = document.createElement("span");
    pill.className = `type-pill ${record.dayType}`;

    const labels = {
      normal: "Normal gün",
      weekend: "Hafta tatili",
      holiday: "Resmî tatil"
    };

    pill.textContent = labels[record.dayType] || labels.normal;
    typeCell.appendChild(pill);
    row.appendChild(typeCell);

    const payCell = document.createElement("td");
    payCell.textContent = money(extraPay);
    row.appendChild(payCell);

    const actionCell = document.createElement("td");
    const deleteButton = document.createElement("button");

    deleteButton.type = "button";
    deleteButton.className = "delete-button";
    deleteButton.textContent = "Sil";

    deleteButton.addEventListener("click", () => {
      records = records.filter(item => item.id !== record.id);
      saveRecords();
      render();
    });

    actionCell.appendChild(deleteButton);
    row.appendChild(actionCell);
    tbody.appendChild(row);
  });

  $("totalHours").textContent = durationText(calculation.totalHours);
  $("extraHours").textContent = durationText(calculation.totalExtraHours);
  $("extraPay").textContent = money(calculation.totalExtraPay);
  $("estimatedTotal").textContent = money(
    settings.salary + calculation.totalExtraPay
  );
  $("recordCount").textContent = `${visible.length} kayıt`;
  $("emptyState").hidden = visible.length > 0;
}

$("settingsForm").addEventListener("submit", event => {
  event.preventDefault();

  const config = readSettingsForm();

  if (!validSettings(config)) {
    $("settingsMessage").textContent =
      "Lütfen tüm alanları kontrol et. Maaş pozitif, haftalık süre 1–168 saat ve katsayılar en az 1 olmalı.";
    return;
  }

  saveSettings(config);
});

$("workForm").addEventListener("submit", event => {
  event.preventDefault();

  if (!settings) {
    $("formMessage").textContent = "Önce kişisel ayarlarını kaydet.";
    return;
  }

  const date = $("workDate").value;
  const start = $("startTime").value;
  const end = $("endTime").value;

  if (!date || !start || !end) {
    $("formMessage").textContent = "Lütfen tarih ve saatleri doldur.";
    return;
  }

  const hours = getWorkedHours(start, end);

  if (hours <= 0 || hours > 24) {
    $("formMessage").textContent = "Giriş ve çıkış saatlerini kontrol et.";
    return;
  }

  if (records.some(record => record.date === date)) {
    if (!confirm("Bu tarihte kayıt var. Yine de eklemek istiyor musun?")) {
      return;
    }
  }

  records.push({
    id: Date.now().toString() + Math.random().toString(16).slice(2),
    date,
    start,
    end,
    hours,
    dayType: $("dayType").value,
    note: $("shiftNote").value.trim()
  });

  saveRecords();
  $("formMessage").textContent = "Çalışma kaydı eklendi.";
  $("shiftNote").value = "";

  render();
});

$("clearMonth").addEventListener("click", () => {
  const month = $("reportMonth").value;

  if (!month) {
    $("formMessage").textContent = "Önce raporlanacak ayı seç.";
    return;
  }

  const count = records.filter(
    record => record.date.startsWith(month)
  ).length;

  if (!count) {
    $("formMessage").textContent = "Bu ayda silinecek kayıt yok.";
    return;
  }

  if (!confirm(`${month} ayındaki ${count} kayıt silinsin mi?`)) {
    return;
  }

  records = records.filter(record => !record.date.startsWith(month));

  saveRecords();
  render();

  $("formMessage").textContent = "Seçili ayın kayıtları silindi.";
});

$("reportMonth").addEventListener("change", render);

function setDefaultDates() {
  const now = new Date();
  const localDate = new Date(
    now.getTime() - now.getTimezoneOffset() * 60000
  );
  const today = localDate.toISOString().slice(0, 10);

  $("workDate").value = today;
  $("reportMonth").value = today.slice(0, 7);
}

function initialize() {
  setDefaultDates();

  if (settings) {
    fillSettingsForm(settings);
    $("settingsMessage").textContent = "Kayıtlı ayarların yüklendi.";
    $("appContent").hidden = false;
  } else {
    $("appContent").hidden = true;
    $("settingsMessage").textContent =
      "Başlamak için kendi çalışma bilgilerini girip ayarlarını kaydet.";
  }

  render();
}

initialize();