(function () {
  "use strict";

  const DB_NAME = "stream-tracker-db";
  const DB_VERSION = 1;
  const DAY_STORE = "days";
  const SETTINGS_STORE = "settings";

  let database;
  let days = [];
  let trackingStartDate = todayKey();
  let calendarMonth = new Date();
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);

  const elements = {};

  document.addEventListener("DOMContentLoaded", initialise);

  async function initialise() {
    cacheElements();
    bindEvents();

    try {
      database = await openDatabase();
      elements.databaseStatus.textContent = "Saved ♡";
      await ensureSettings();
      await refreshData();
      resetLogForm();
    } catch (error) {
      console.error(error);
      elements.databaseStatus.textContent = "Storage error";
      setStatus("The local database could not be opened.", true);
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./service-worker.js").catch(console.error);
    }
  }

  function cacheElements() {
    [
      "databaseStatus", "totalHours", "weekHours", "monthHours", "streamDays",
      "currentStreak", "calendarHeading", "calendarGrid", "previousMonthButton",
      "nextMonthButton", "logForm", "logDate", "streamStatus", "durationFields",
      "logHours", "logMinutes",
      "logNote", "resetFormButton", "deleteLogButton", "historyList",
      "trackingStartDate", "saveSettingsButton", "exportBackupButton",
      "importBackupButton", "exportCsvButton", "backupFileInput",
      "clearAllButton", "statusMessage"
    ].forEach(function (id) {
      elements[id] = document.getElementById(id);
    });
  }

  function bindEvents() {
    elements.previousMonthButton.addEventListener("click", function () {
      calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
      renderCalendar();
    });
    elements.nextMonthButton.addEventListener("click", function () {
      calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
      renderCalendar();
    });
    elements.logForm.addEventListener("submit", saveManualLog);
    elements.streamStatus.addEventListener("change", updateDurationVisibility);
    elements.resetFormButton.addEventListener("click", resetLogForm);
    elements.deleteLogButton.addEventListener("click", deleteSelectedLog);
    elements.saveSettingsButton.addEventListener("click", saveSettings);
    elements.exportBackupButton.addEventListener("click", exportBackup);
    elements.importBackupButton.addEventListener("click", function () {
      elements.backupFileInput.click();
    });
    elements.backupFileInput.addEventListener("change", importBackup);
    elements.exportCsvButton.addEventListener("click", exportCsv);
    elements.clearAllButton.addEventListener("click", clearAllData);
  }

  function openDatabase() {
    return new Promise(function (resolve, reject) {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = function () {
        const db = request.result;
        if (!db.objectStoreNames.contains(DAY_STORE)) {
          db.createObjectStore(DAY_STORE, { keyPath: "date" });
        }
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
          db.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
        }
      };

      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  function transact(storeName, mode, operation) {
    return new Promise(function (resolve, reject) {
      const transaction = database.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      const request = operation(store);

      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  function getAllDays() {
    return transact(DAY_STORE, "readonly", function (store) { return store.getAll(); });
  }

  function getSetting(key) {
    return transact(SETTINGS_STORE, "readonly", function (store) { return store.get(key); });
  }

  function putDay(day) {
    return transact(DAY_STORE, "readwrite", function (store) { return store.put(day); });
  }

  function deleteDay(date) {
    return transact(DAY_STORE, "readwrite", function (store) { return store.delete(date); });
  }

  function putSetting(key, value) {
    return transact(SETTINGS_STORE, "readwrite", function (store) {
      return store.put({ key: key, value: value });
    });
  }

  function clearStore(storeName) {
    return transact(storeName, "readwrite", function (store) { return store.clear(); });
  }

  async function ensureSettings() {
    const savedStart = await getSetting("trackingStartDate");
    if (savedStart && savedStart.value) {
      trackingStartDate = savedStart.value;
    } else {
      await putSetting("trackingStartDate", trackingStartDate);
    }
    elements.trackingStartDate.value = trackingStartDate;
  }

  async function refreshData() {
    days = await getAllDays();
    days = days.map(function (day) {
      return Object.assign({}, day, {
        status: day.status === "missed" ? "missed" : "streamed",
        seconds: Number.isFinite(day.seconds) ? day.seconds : 0
      });
    });
    days.sort(function (a, b) { return b.date.localeCompare(a.date); });
    renderAll();
  }

  function renderAll() {
    renderStats();
    renderCalendar();
    renderHistory();
  }

  function renderStats() {
    const now = new Date();
    const weekStart = new Date(now);
    const mondayOffset = (now.getDay() + 6) % 7;
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - mondayOffset);
    const weekStartKey = toDateKey(weekStart);
    const monthPrefix = now.getFullYear() + "-" + pad(now.getMonth() + 1);

    const streamedDays = days.filter(function (day) { return day.status === "streamed"; });
    const weekSeconds = streamedDays
      .filter(function (day) { return day.date >= weekStartKey; })
      .reduce(function (sum, day) { return sum + day.seconds; }, 0);
    const monthSeconds = streamedDays
      .filter(function (day) { return day.date.indexOf(monthPrefix) === 0; })
      .reduce(function (sum, day) { return sum + day.seconds; }, 0);
    const totalSeconds = streamedDays.reduce(function (sum, day) {
      return sum + day.seconds;
    }, 0);

    elements.totalHours.textContent = formatDuration(totalSeconds);
    elements.weekHours.textContent = formatDuration(weekSeconds);
    elements.monthHours.textContent = formatDuration(monthSeconds);
    elements.streamDays.textContent = String(streamedDays.length);
    const streak = calculateStreak();
    elements.currentStreak.textContent = streak + (streak === 1 ? " day" : " days");
  }

  function calculateStreak() {
    const streamedDates = new Set(days
      .filter(function (day) { return day.status === "streamed"; })
      .map(function (day) { return day.date; }));
    let cursor = new Date();
    cursor.setHours(0, 0, 0, 0);

    if (!streamedDates.has(toDateKey(cursor))) {
      cursor.setDate(cursor.getDate() - 1);
    }

    let streak = 0;
    while (streamedDates.has(toDateKey(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  function renderCalendar() {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    elements.calendarHeading.textContent = calendarMonth.toLocaleDateString(undefined, {
      month: "long", year: "numeric"
    });
    elements.calendarGrid.textContent = "";

    const firstDay = new Date(year, month, 1);
    const mondayIndex = (firstDay.getDay() + 6) % 7;
    const gridStart = new Date(year, month, 1 - mondayIndex);
    const records = new Map(days.map(function (day) { return [day.date, day]; }));
    const today = todayKey();

    for (let index = 0; index < 42; index += 1) {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      const dateKey = toDateKey(date);
      const record = records.get(dateKey);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "calendar-day";
      button.dataset.date = dateKey;

      if (date.getMonth() !== month) button.classList.add("other-month");
      if (dateKey === today) button.classList.add("today");
      if (dateKey > today) button.classList.add("future");
      if (record && record.status === "streamed") {
        button.classList.add("streamed");
      } else if ((record && record.status === "missed") ||
                 (dateKey >= trackingStartDate && dateKey < today)) {
        button.classList.add("missed");
      }

      const dayNumber = document.createElement("span");
      dayNumber.className = "day-number";
      dayNumber.textContent = String(date.getDate());
      button.appendChild(dayNumber);

      if (record && record.status === "streamed") {
        const duration = document.createElement("span");
        duration.className = "day-duration";
        duration.textContent = formatCompactDuration(record.seconds);
        button.appendChild(duration);
      }

      button.addEventListener("click", function () { selectCalendarDate(dateKey); });
      elements.calendarGrid.appendChild(button);
    }
  }

  function selectCalendarDate(dateKey) {
    const record = days.find(function (day) { return day.date === dateKey; });
    elements.logDate.value = dateKey;

    if (record) {
      elements.streamStatus.value = record.status;
      const totalMinutes = Math.round(record.seconds / 60);
      elements.logHours.value = String(Math.floor(totalMinutes / 60));
      elements.logMinutes.value = String(totalMinutes % 60);
      elements.logNote.value = record.note || "";
      elements.deleteLogButton.hidden = false;
    } else {
      elements.streamStatus.value = "streamed";
      elements.logHours.value = "0";
      elements.logMinutes.value = "0";
      elements.logNote.value = "";
      elements.deleteLogButton.hidden = true;
    }

    updateDurationVisibility();

    elements.logForm.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function renderHistory() {
    elements.historyList.textContent = "";

    if (!days.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "Your first stream memory will appear here ♡";
      elements.historyList.appendChild(empty);
      return;
    }

    days.slice(0, 30).forEach(function (day) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "history-item";

      const date = document.createElement("span");
      date.className = "history-date";
      date.textContent = formatLongDate(day.date);

      const duration = document.createElement("span");
      duration.className = "history-duration";
      if (day.status === "missed") {
        duration.classList.add("missed");
        duration.textContent = "No stream";
      } else {
        duration.textContent = formatDuration(day.seconds);
      }

      item.appendChild(date);
      item.appendChild(duration);

      if (day.note) {
        const note = document.createElement("span");
        note.className = "history-note";
        note.textContent = day.note;
        item.appendChild(note);
      }

      item.addEventListener("click", function () { selectCalendarDate(day.date); });
      elements.historyList.appendChild(item);
    });
  }

  async function saveManualLog(event) {
    event.preventDefault();
    const date = elements.logDate.value;
    const status = elements.streamStatus.value;
    const hours = Number(elements.logHours.value);
    const minutes = Number(elements.logMinutes.value);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setStatus("Select a valid date.", true);
      return;
    }
    if (date > todayKey()) {
      setStatus("A future date cannot be logged.", true);
      return;
    }
    if (status === "streamed" && (!Number.isInteger(hours) || hours < 0 || hours > 24)) {
      setStatus("Hours must be a whole number from 0 to 24.", true);
      return;
    }
    if (status === "streamed" && (!Number.isInteger(minutes) || minutes < 0 || minutes > 59)) {
      setStatus("Minutes must be a whole number from 0 to 59.", true);
      return;
    }
    if (status === "streamed" && hours === 24 && minutes > 0) {
      setStatus("A single day cannot exceed 24 hours.", true);
      return;
    }
    if (status === "streamed" && hours === 0 && minutes === 0) {
      setStatus("Enter at least one minute of streaming time.", true);
      return;
    }

    await putDay({
      date: date,
      status: status,
      seconds: status === "streamed" ? (hours * 60 + minutes) * 60 : 0,
      note: elements.logNote.value.trim(),
      updatedAt: new Date().toISOString()
    });

    if (date < trackingStartDate) {
      trackingStartDate = date;
      elements.trackingStartDate.value = date;
      await putSetting("trackingStartDate", date);
    }

    await refreshData();
    resetLogForm();
    setStatus("Streaming log saved.");
  }

  async function deleteSelectedLog() {
    const date = elements.logDate.value;
    if (!days.some(function (day) { return day.date === date; })) return;

    if (!window.confirm("Delete the streaming record for " + formatLongDate(date) + "?")) return;
    await deleteDay(date);
    await refreshData();
    resetLogForm();
    setStatus("Streaming log deleted.");
  }

  function resetLogForm() {
    elements.logDate.value = todayKey();
    elements.streamStatus.value = "streamed";
    elements.logHours.value = "0";
    elements.logMinutes.value = "0";
    elements.logNote.value = "";
    elements.deleteLogButton.hidden = true;
    updateDurationVisibility();
  }

  function updateDurationVisibility() {
    const didStream = elements.streamStatus.value === "streamed";
    elements.durationFields.hidden = !didStream;
    elements.logHours.disabled = !didStream;
    elements.logMinutes.disabled = !didStream;
  }

  async function saveSettings() {
    const value = elements.trackingStartDate.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      setStatus("Select a valid tracking start date.", true);
      return;
    }
    if (value > todayKey()) {
      setStatus("The tracking start date cannot be in the future.", true);
      return;
    }

    trackingStartDate = value;
    await putSetting("trackingStartDate", value);
    renderCalendar();
    setStatus("Tracking start date saved.");
  }

  function exportBackup() {
    const backup = {
      app: "Stream Diary",
      version: 2,
      exportedAt: new Date().toISOString(),
      trackingStartDate: trackingStartDate,
      days: days.slice().sort(function (a, b) { return a.date.localeCompare(b.date); })
    };
    downloadFile(
      "stream-diary-backup-" + todayKey() + ".json",
      JSON.stringify(backup, null, 2),
      "application/json"
    );
    setStatus("Backup exported.");
  }

  async function importBackup(event) {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;

    try {
      const backup = JSON.parse(await file.text());
      if (!backup || !Array.isArray(backup.days)) throw new Error("Invalid backup");
      const validatedDays = backup.days.map(function (day) {
        const status = day.status === "missed" ? "missed" : "streamed";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date) || !Number.isFinite(day.seconds) ||
            (status === "streamed" && day.seconds <= 0) || day.seconds < 0) {
          throw new Error("Invalid record in backup");
        }
        return {
          date: day.date,
          status: status,
          seconds: status === "streamed" ? Math.round(day.seconds) : 0,
          note: typeof day.note === "string" ? day.note.slice(0, 120) : "",
          updatedAt: new Date().toISOString()
        };
      });

      if (!window.confirm("Import this backup and replace the current streaming records?")) return;

      await clearStore(DAY_STORE);
      for (const day of validatedDays) {
        await putDay(day);
      }

      if (backup.trackingStartDate && /^\d{4}-\d{2}-\d{2}$/.test(backup.trackingStartDate)) {
        trackingStartDate = backup.trackingStartDate;
        await putSetting("trackingStartDate", trackingStartDate);
      }

      elements.trackingStartDate.value = trackingStartDate;
      await refreshData();
      setStatus("Backup imported successfully.");
    } catch (error) {
      console.error(error);
      setStatus("That file is not a valid Stream Diary backup.", true);
    }
  }

  function exportCsv() {
    const rows = [["Date", "Status", "Hours", "Minutes", "Total hours", "Note"]];
    days.slice().sort(function (a, b) { return a.date.localeCompare(b.date); }).forEach(function (day) {
      const totalMinutes = Math.round(day.seconds / 60);
      rows.push([
        day.date,
        day.status === "streamed" ? "Streamed" : "Did not stream",
        Math.floor(totalMinutes / 60),
        totalMinutes % 60,
        (day.seconds / 3600).toFixed(2),
        day.note || ""
      ]);
    });

    const csv = rows.map(function (row) {
      return row.map(function (value) {
        return '"' + String(value).replace(/"/g, '""') + '"';
      }).join(",");
    }).join("\n");

    downloadFile("stream-diary-" + todayKey() + ".csv", csv, "text/csv;charset=utf-8");
    setStatus("CSV exported.");
  }

  async function clearAllData() {
    if (!window.confirm("Permanently delete all streaming records and settings on this device?")) return;
    if (!window.confirm("This cannot be undone unless you exported a backup. Continue?")) return;

    await clearStore(DAY_STORE);
    await clearStore(SETTINGS_STORE);
    trackingStartDate = todayKey();
    await putSetting("trackingStartDate", trackingStartDate);
    elements.trackingStartDate.value = trackingStartDate;
    await refreshData();
    resetLogForm();
    setStatus("All streaming data was deleted.");
  }

  function downloadFile(filename, contents, mimeType) {
    const blob = new Blob([contents], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function formatDuration(seconds) {
    if (seconds <= 0) return "0h";
    const totalMinutes = Math.round(seconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (!hours) return minutes + "m";
    if (!minutes) return hours + "h";
    return hours + "h " + minutes + "m";
  }

  function formatCompactDuration(seconds) {
    if (seconds <= 0) return "0h";
    const hours = seconds / 3600;
    if (hours >= 10) return hours.toFixed(1).replace(".0", "") + "h";
    return hours.toFixed(1) + "h";
  }

  function formatLongDate(dateKey) {
    return fromDateKey(dateKey).toLocaleDateString(undefined, {
      weekday: "short", day: "numeric", month: "short", year: "numeric"
    });
  }

  function todayKey() { return toDateKey(new Date()); }

  function toDateKey(date) {
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }

  function fromDateKey(key) {
    const parts = key.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function pad(value) { return String(value).padStart(2, "0"); }

  function setStatus(message, isError) {
    elements.statusMessage.textContent = message;
    elements.statusMessage.style.color = isError ? "var(--red)" : "var(--muted)";
  }

  window.StreamTrackerCore = {
    formatDuration: formatDuration,
    toDateKey: toDateKey,
    fromDateKey: fromDateKey
  };
})();
