import React, { useState, useEffect, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import { Plus, X, Search, Phone, Mail, Calendar as CalendarIcon, Users, Download, ChevronLeft, ChevronRight, Pencil, Trash2, ArrowRight, Building2, Upload, FileText, ExternalLink, Globe, MapPin, StickyNote, Send, Info, Lock, ShieldCheck, AlertTriangle, Clock, DollarSign } from "lucide-react";
import { api } from "./api.js";
import Logo from "./Logo.jsx";

// ---------- constants ----------
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Storage key deliberately NOT renamed at the Site Sparrow rebrand — it's an
// internal localStorage key, and changing it would silently reset every
// existing user's selected business on upgrade.
const ACTIVE_BIZ_KEY = "simple-scheduler-active-business-id";

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const pad2 = (n) => String(n).padStart(2, "0");
const toDateStr = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
const todayStr = () => {
  const t = new Date();
  return toDateStr(t.getFullYear(), t.getMonth(), t.getDate());
};

function safeSheetName(name) {
  const cleaned = name.replace(/[\\/*?:\[\]]/g, "").trim();
  return cleaned.slice(0, 31) || "Sheet";
}

function humanFileSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------- appointment time / duration ----------
// Multi-day options (`days`) don't carry a per-card duration — each generated
// day becomes its own full-workday (8hr) card, per how multi-day jobs work here.
const DURATION_OPTIONS = [
  { key: "15", label: "15 min", minutes: 15 },
  { key: "30", label: "30 min", minutes: 30 },
  { key: "45", label: "45 min", minutes: 45 },
  { key: "60", label: "1 hr", minutes: 60 },
  { key: "90", label: "1.5 hr", minutes: 90 },
  { key: "120", label: "2 hr", minutes: 120 },
  { key: "150", label: "2.5 hr", minutes: 150 },
  { key: "180", label: "3 hr", minutes: 180 },
  { key: "210", label: "3.5 hr", minutes: 210 },
  { key: "240", label: "4 hr", minutes: 240 },
  { key: "300", label: "5 hr", minutes: 300 },
  { key: "360", label: "6 hr", minutes: 360 },
  { key: "420", label: "7 hr", minutes: 420 },
  { key: "480", label: "8 hr (full day)", minutes: 480 },
  { key: "1d", label: "1 day", days: 1 },
  { key: "2d", label: "2 days", days: 2 },
  { key: "3d", label: "3 days", days: 3 },
  { key: "4d", label: "4 days", days: 4 },
  { key: "5d", label: "5 days (1 week)", days: 5 },
];
const MULTI_DAY_CARD_MINUTES = 480; // each generated day is a full 8hr workday block

const durationOptionForMinutes = (minutes) =>
  DURATION_OPTIONS.find((o) => o.minutes === minutes) || DURATION_OPTIONS.find((o) => o.key === "60");

function timeToMinutes(time) {
  const [h, m] = (time || "00:00").split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(totalMinutes) {
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(wrapped / 60))}:${pad2(wrapped % 60)}`;
}

function formatTime12h(time) {
  const [h, m] = (time || "00:00").split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad2(m)} ${period}`;
}

function formatDurationLabel(minutes) {
  if (minutes % 60 === 0) return `${minutes / 60} hr${minutes === 60 ? "" : "s"}`;
  if (minutes < 60) return `${minutes} min`;
  return `${(minutes / 60).toFixed(1)} hrs`;
}

function formatTimeRange(startTime, durationMinutes) {
  const endTime = minutesToTime(timeToMinutes(startTime) + durationMinutes);
  return `${formatTime12h(startTime)} – ${formatTime12h(endTime)} (${formatDurationLabel(durationMinutes)})`;
}

function addDaysToDateStr(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return toDateStr(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

// Time-range overlap between two [start, start+duration) windows on the same date.
function timeRangesOverlap(aStart, aDuration, bStart, bDuration) {
  const aS = timeToMinutes(aStart);
  const aE = aS + aDuration;
  const bS = timeToMinutes(bStart);
  const bE = bS + bDuration;
  return aS < bE && bS < aE;
}

// ---------- main component ----------
export default function App() {
  const [version, setVersion] = useState(null);
  const [licenseStatus, setLicenseStatus] = useState(null);
  const [licenseChecked, setLicenseChecked] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [updateStatus, setUpdateStatus] = useState(null);

  const [businesses, setBusinesses] = useState([]);
  const [activeBusinessId, setActiveBusinessId] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const [customers, setCustomers] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [businessProfile, setBusinessProfile] = useState(null);
  const [interactionLogs, setInteractionLogs] = useState([]);
  const [bundleLoaded, setBundleLoaded] = useState(false);

  const [view, setView] = useState("calendar"); // calendar | crm | profile
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [jobModal, setJobModal] = useState(null); // {date, jobId?}
  const [customerModal, setCustomerModal] = useState(false);
  const [renamingTab, setRenamingTab] = useState(null);
  const [search, setSearch] = useState("");
  const [weekExportDate, setWeekExportDate] = useState(todayStr());
  const [saveStatus, setSaveStatus] = useState("idle");
  const saveStatusTimer = useRef(null);

  // ---- load version + license/trial status (gates everything below) ----
  useEffect(() => {
    (async () => {
      try {
        const v = await api.getVersion();
        setVersion(v.version);
      } catch (e) {
        console.error(e);
      }
      try {
        const status = await api.getLicenseStatus();
        setLicenseStatus(status);
      } catch (e) {
        console.error(e);
        // Fail open — a broken license check shouldn't lock someone out of their own data.
        setLicenseStatus({ mode: "trial", onboardingCompleted: true, trial: { daysLeft: 0, active: true } });
      } finally {
        setLicenseChecked(true);
      }
    })();
  }, []);

  const refreshLicenseStatus = async ({ force = false } = {}) => {
    const status = force ? await api.revalidateLicense() : await api.getLicenseStatus();
    setLicenseStatus(status);
    return status;
  };

  // ---- poll for a downloaded update (no-op unless this is a packaged build) ----
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const status = await api.getUpdateStatus();
        if (!cancelled) setUpdateStatus(status);
      } catch (e) {
        // dev/preview mode has no /api/update route history to worry about — ignore
      }
    };
    poll();
    const interval = setInterval(poll, 30 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const installUpdateNow = async () => {
    await api.installUpdate();
  };

  // ---- load business list ----
  useEffect(() => {
    (async () => {
      try {
        const list = await api.listBusinesses();
        setBusinesses(list);
        const savedId = localStorage.getItem(ACTIVE_BIZ_KEY);
        const initial = list.find((b) => b.id === savedId) || list[0];
        setActiveBusinessId(initial ? initial.id : null);
      } catch (e) {
        console.error(e);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // ---- load the active business's data whenever it changes ----
  useEffect(() => {
    if (!activeBusinessId) return;
    localStorage.setItem(ACTIVE_BIZ_KEY, activeBusinessId);
    let cancelled = false;
    (async () => {
      setBundleLoaded(false);
      try {
        const bundle = await api.getBundle(activeBusinessId);
        if (cancelled) return;
        setCustomers(bundle.customers);
        setJobs(bundle.jobs);
        setBusinessProfile(bundle.profile);
        setInteractionLogs(bundle.interactionLogs);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setBundleLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeBusinessId]);

  // ---- brief "Saving… / Saved" indicator around each mutation ----
  const withSaveStatus = async (fn) => {
    setSaveStatus("saving");
    if (saveStatusTimer.current) clearTimeout(saveStatusTimer.current);
    try {
      await fn();
      setSaveStatus("saved");
      saveStatusTimer.current = setTimeout(() => setSaveStatus("idle"), 1500);
    } catch (e) {
      console.error(e);
      setSaveStatus("error");
      alert(e.message || "Something went wrong saving that. Please try again.");
    }
  };

  if (!licenseChecked || !licenseStatus) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-ink-50 text-ink-500 text-sm">
        Loading…
      </div>
    );
  }

  const accessGranted = licenseStatus.mode === "trial" || licenseStatus.mode === "licensed";

  if (!accessGranted) {
    return (
      <AccessGate
        status={licenseStatus}
        version={version}
        onActivated={(status) => setLicenseStatus(status)}
      />
    );
  }

  if (!licenseStatus.onboardingCompleted) {
    return (
      <Onboarding
        status={licenseStatus}
        onDone={async () => {
          await api.completeOnboarding();
          setLicenseStatus((s) => ({ ...s, onboardingCompleted: true }));
        }}
      />
    );
  }

  if (!loaded || !activeBusinessId) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-ink-50 text-ink-500 text-sm">
        Loading your workspace…
      </div>
    );
  }

  const activeBiz = businesses.find((b) => b.id === activeBusinessId) || businesses[0];

  // ---------- mutation helpers ----------
  const addBusiness = () => {
    withSaveStatus(async () => {
      const biz = await api.createBusiness(`Business ${businesses.length + 1}`);
      setBusinesses((prev) => [...prev, biz]);
      setActiveBusinessId(biz.id);
      setSelectedCustomerId(null);
    });
  };

  const renameBusiness = (id, name) => {
    if (!name.trim()) return;
    withSaveStatus(async () => {
      const updated = await api.renameBusiness(id, name);
      setBusinesses((prev) => prev.map((b) => (b.id === id ? updated : b)));
    });
  };

  const deleteBusiness = (id) => {
    if (businesses.length === 1) return;
    if (!window.confirm("Delete this business and all its customers, jobs, and files? This can't be undone.")) return;
    withSaveStatus(async () => {
      await api.deleteBusiness(id);
      setBusinesses((prev) => {
        const next = prev.filter((b) => b.id !== id);
        if (activeBusinessId === id) setActiveBusinessId(next[0]?.id || null);
        return next;
      });
    });
  };

  const updateBusinessProfile = (patch) => {
    withSaveStatus(async () => {
      const updated = await api.updateProfile(activeBusinessId, patch);
      setBusinessProfile((prev) => ({ ...prev, ...updated }));
    });
  };

  const handleFilesChanged = (fileRefs) => {
    setBusinessProfile((prev) => ({ ...prev, fileRefs }));
  };

  const addBusinessActivity = (entry) => {
    withSaveStatus(async () => {
      await api.saveInteractionLog(activeBusinessId, { ...entry, customerId: null });
      setBusinessProfile((prev) => ({ ...prev, activityLog: [...(prev.activityLog || []), entry] }));
    });
  };

  const deleteBusinessActivity = (entryId) => {
    withSaveStatus(async () => {
      await api.deleteInteractionLog(entryId);
      setBusinessProfile((prev) => ({
        ...prev,
        activityLog: (prev.activityLog || []).filter((e) => e.id !== entryId),
      }));
    });
  };

  const addInteractionLog = (entry) => {
    withSaveStatus(async () => {
      await api.saveInteractionLog(activeBusinessId, entry);
      setInteractionLogs((prev) => [...prev, entry]);
    });
  };

  const deleteInteractionLog = (entryId) => {
    withSaveStatus(async () => {
      await api.deleteInteractionLog(entryId);
      setInteractionLogs((prev) => prev.filter((e) => e.id !== entryId));
    });
  };

  const addOrUpdateCustomer = (customer) => {
    withSaveStatus(async () => {
      const saved = await api.saveCustomer(activeBusinessId, customer);
      setCustomers((prev) => {
        const idx = prev.findIndex((c) => c.id === saved.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [...prev, saved];
      });
    });
  };

  const updatePricingNote = (customerId, pricingNote) => {
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) return;
    addOrUpdateCustomer({ ...customer, pricingNote });
  };

  const savePricingOverride = (customerId, override) => {
    withSaveStatus(async () => {
      const saved = await api.savePricingOverride(customerId, override);
      setCustomers((prev) =>
        prev.map((c) =>
          c.id !== customerId
            ? c
            : {
                ...c,
                pricingOverrides: (() => {
                  const idx = (c.pricingOverrides || []).findIndex((o) => o.id === saved.id);
                  if (idx >= 0) {
                    const next = [...c.pricingOverrides];
                    next[idx] = saved;
                    return next;
                  }
                  return [...(c.pricingOverrides || []), saved];
                })(),
              }
        )
      );
    });
  };

  const deletePricingOverride = (overrideId) => {
    withSaveStatus(async () => {
      await api.deletePricingOverride(overrideId);
      setCustomers((prev) =>
        prev.map((c) => ({
          ...c,
          pricingOverrides: (c.pricingOverrides || []).filter((o) => o.id !== overrideId),
        }))
      );
    });
  };

  const deleteCustomer = (id) => {
    if (!window.confirm("Delete this customer and their job history?")) return;
    setSelectedCustomerId(null);
    withSaveStatus(async () => {
      await api.deleteCustomer(id);
      setCustomers((prev) => prev.filter((c) => c.id !== id));
      setJobs((prev) => prev.filter((j) => j.customerId !== id));
      setInteractionLogs((prev) => prev.filter((l) => l.customerId !== id));
    });
  };

  const addOrUpdateJob = (job) => addOrUpdateJobs([job]);

  // Accepts one or more jobs in a single save-status cycle — used for both a
  // normal single-appointment save and multi-day saves (one card per day).
  const addOrUpdateJobs = (jobsToSave) => {
    withSaveStatus(async () => {
      const saved = [];
      for (const job of jobsToSave) {
        saved.push(await api.saveJob(activeBusinessId, job));
      }
      setJobs((prev) => {
        let next = [...prev];
        for (const savedJob of saved) {
          const idx = next.findIndex((j) => j.id === savedJob.id);
          if (idx >= 0) next[idx] = savedJob;
          else next.push(savedJob);
        }
        return next;
      });
    });
  };

  const deleteJob = (id) => {
    withSaveStatus(async () => {
      await api.deleteJob(id);
      setJobs((prev) => prev.filter((j) => j.id !== id));
    });
  };

  // ---------- export ----------
  const exportToExcel = async () => {
    let snapshot;
    try {
      snapshot = await api.exportSnapshot();
    } catch (e) {
      alert("Couldn't build the export. Try again.");
      return;
    }
    const wb = XLSX.utils.book_new();
    snapshot.businesses.forEach((biz) => {
      const custs = snapshot.customers[biz.id] || [];
      const jbs = snapshot.jobs[biz.id] || [];
      const prof = snapshot.businessProfiles[biz.id] || {};

      const infoRows = [
        { Field: "Business name", Value: biz.name },
        { Field: "Address", Value: prof.address },
        { Field: "Industry / trade", Value: prof.industry },
        { Field: "Primary contact", Value: prof.contactName },
        { Field: "Contact phone", Value: prof.contactPhone },
        { Field: "Contact email", Value: prof.contactEmail },
        { Field: "Google profile link", Value: prof.googleProfileUrl },
        { Field: "Website", Value: prof.websiteUrl },
        { Field: "Notes", Value: prof.notes },
        { Field: "Files on record", Value: (prof.fileRefs || []).map((f) => f.name).join(", ") },
      ];
      const infoSheet = XLSX.utils.json_to_sheet(infoRows);
      XLSX.utils.book_append_sheet(wb, infoSheet, safeSheetName(`${biz.name} Info`));
      const custRows = custs.map((c) => ({
        Name: c.name,
        Phone: c.phone,
        Email: c.email,
        "Jobs on file": jbs.filter((j) => j.customerId === c.id).length,
        "Pricing note": c.pricingNote || "",
        "Pricing overrides": (c.pricingOverrides || [])
          .map((o) => `${o.serviceLabel}: $${o.price.toFixed(2)}`)
          .join("; "),
      }));
      const custSheet = XLSX.utils.json_to_sheet(
        custRows.length
          ? custRows
          : [{ Name: "", Phone: "", Email: "", "Jobs on file": "", "Pricing note": "", "Pricing overrides": "" }]
      );
      XLSX.utils.book_append_sheet(wb, custSheet, safeSheetName(`${biz.name} Customers`));

      const jobRows = jbs
        .slice()
        .sort((a, b) => (a.date === b.date ? timeToMinutes(a.startTime) - timeToMinutes(b.startTime) : a.date < b.date ? -1 : 1))
        .map((j) => {
          const cust = custs.find((c) => c.id === j.customerId);
          return {
            Date: j.date,
            Time: formatTime12h(j.startTime),
            Duration: formatDurationLabel(j.durationMinutes),
            Customer: cust ? cust.name : "(deleted customer)",
            Phone: cust ? cust.phone : "",
            "Job / Service": j.service,
            Notes: j.notes,
          };
        });
      const jobSheet = XLSX.utils.json_to_sheet(
        jobRows.length
          ? jobRows
          : [{ Date: "", Time: "", Duration: "", Customer: "", Phone: "", "Job / Service": "", Notes: "" }]
      );
      XLSX.utils.book_append_sheet(wb, jobSheet, safeSheetName(`${biz.name} Jobs`));

      const logs = snapshot.interactionLogs[biz.id] || [];
      const logRows = logs
        .slice()
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .map((l) => {
          const cust = custs.find((c) => c.id === l.customerId);
          return {
            Date: l.date,
            Customer: cust ? cust.name : "(deleted customer)",
            Type: l.type === "email" ? "Email" : "Note",
            Details: l.text,
          };
        });
      const logSheet = XLSX.utils.json_to_sheet(logRows.length ? logRows : [{ Date: "", Customer: "", Type: "", Details: "" }]);
      XLSX.utils.book_append_sheet(wb, logSheet, safeSheetName(`${biz.name} Activity Log`));
    });
    XLSX.writeFile(wb, `site-sparrow-export-${todayStr()}.xlsx`);
  };

  const exportWeeklySchedule = (anchorDateStr) => {
    const [wy, wm, wd] = anchorDateStr.split("-").map(Number);
    const anchor = new Date(wy, wm - 1, wd);
    const dow = (anchor.getDay() + 6) % 7; // Monday-first offset
    const monday = new Date(anchor);
    monday.setDate(anchor.getDate() - dow);

    const wb = XLSX.utils.book_new();
    const rows = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
      const dayLabel = d.toLocaleDateString(undefined, { weekday: "long" });
      const dayJobs = jobs
        .filter((j) => j.date === dateStr)
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
      if (dayJobs.length === 0) {
        rows.push({ Day: dayLabel, Date: dateStr, Time: "", Duration: "", Customer: "", Phone: "", "Job / Service": "", Notes: "" });
      } else {
        dayJobs.forEach((j) => {
          const cust = customers.find((c) => c.id === j.customerId);
          rows.push({
            Day: dayLabel,
            Date: dateStr,
            Time: formatTime12h(j.startTime),
            Duration: formatDurationLabel(j.durationMinutes),
            Customer: cust ? cust.name : "(deleted customer)",
            Phone: cust ? cust.phone : "",
            "Job / Service": j.service,
            Notes: j.notes,
          });
        });
      }
    }
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet["!cols"] = [{ wch: 11 }, { wch: 11 }, { wch: 10 }, { wch: 10 }, { wch: 20 }, { wch: 14 }, { wch: 24 }, { wch: 30 }];
    const mondayStr = toDateStr(monday.getFullYear(), monday.getMonth(), monday.getDate());
    XLSX.utils.book_append_sheet(wb, sheet, safeSheetName(`Week of ${mondayStr}`));
    XLSX.writeFile(wb, `weekly-schedule-${safeSheetName(activeBiz.name)}-${mondayStr}.xlsx`);
  };

  // ---------- navigation helpers ----------
  const jumpToCustomer = (customerId) => {
    setSelectedCustomerId(customerId);
    setView("crm");
  };

  const jumpToJobDate = (dateStr) => {
    const [y, m] = dateStr.split("-").map(Number);
    setCalYear(y);
    setCalMonth(m - 1);
    setView("calendar");
  };

  const filteredCustomers = (() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
    );
  })();

  return (
    <div className="w-full h-screen flex flex-col bg-ink-50 text-ink-800 font-sans">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-ink-200 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: activeBiz.color }} />
          <h1 className="text-[15px] font-semibold tracking-tight text-ink-900">{activeBiz.name}</h1>
          <span className="text-xs text-ink-400">
            {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : saveStatus === "error" ? "Couldn't save" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-ink-100 rounded-lg p-0.5">
            <button
              onClick={() => setView("calendar")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                view === "calendar" ? "bg-white shadow-sm text-ink-900" : "text-ink-500 hover:text-ink-700"
              }`}
            >
              <CalendarIcon size={14} /> Calendar
            </button>
            <button
              onClick={() => setView("crm")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                view === "crm" ? "bg-white shadow-sm text-ink-900" : "text-ink-500 hover:text-ink-700"
              }`}
            >
              <Users size={14} /> CRM
            </button>
            <button
              onClick={() => setView("profile")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                view === "profile" ? "bg-white shadow-sm text-ink-900" : "text-ink-500 hover:text-ink-700"
              }`}
            >
              <Building2 size={14} /> Business Profile
            </button>
          </div>
          <button
            onClick={exportToExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-ink-600 border border-ink-200 hover:bg-ink-50 transition"
          >
            <Download size={14} /> Export to Excel
          </button>
          {updateStatus?.updateDownloaded && (
            <button
              onClick={installUpdateNow}
              className="text-xs px-2 py-1 rounded-md border border-ink-300 bg-ink-100 text-ink-800 hover:bg-ink-200"
              title={`Version ${updateStatus.version} is downloaded — click to restart and install`}
            >
              Update ready · Restart
            </button>
          )}
          {licenseStatus.mode === "trial" && (
            <button
              onClick={() => setAboutOpen(true)}
              className={`text-xs px-2 py-1 rounded-md border ${
                licenseStatus.trial.daysLeft <= 3
                  ? "border-amber-300 bg-amber-50 text-amber-800"
                  : "border-ink-200 text-ink-500 hover:bg-ink-50"
              }`}
            >
              Trial · {licenseStatus.trial.daysLeft}d left
            </button>
          )}
          <button
            onClick={() => setAboutOpen(true)}
            className="flex items-center gap-1 text-xs text-ink-400 hover:text-ink-700 px-1.5"
            title="About / license"
          >
            <Info size={13} /> v{version || "…"}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {!bundleLoaded ? (
          <div className="h-full flex items-center justify-center text-sm text-ink-400">Loading…</div>
        ) : view === "profile" ? (
          <BusinessProfileView
            key={activeBiz.id}
            profile={businessProfile}
            businessId={activeBiz.id}
            onUpdate={updateBusinessProfile}
            onFilesChanged={handleFilesChanged}
            onAddActivity={addBusinessActivity}
            onDeleteActivity={deleteBusinessActivity}
          />
        ) : view === "calendar" ? (
          <CalendarView
            jobs={jobs}
            customers={customers}
            month={calMonth}
            year={calYear}
            setMonth={setCalMonth}
            setYear={setCalYear}
            onOpenJob={(dateStr, jobId) => setJobModal({ date: dateStr, jobId: jobId || null })}
            onJumpToCustomer={jumpToCustomer}
            weekExportDate={weekExportDate}
            setWeekExportDate={setWeekExportDate}
            onExportWeek={() => exportWeeklySchedule(weekExportDate)}
          />
        ) : (
          <CRMView
            customers={filteredCustomers}
            allJobsCount={jobs.length}
            jobs={jobs}
            interactionLogs={interactionLogs}
            onAddInteractionLog={addInteractionLog}
            onDeleteInteractionLog={deleteInteractionLog}
            search={search}
            setSearch={setSearch}
            selectedCustomerId={selectedCustomerId}
            setSelectedCustomerId={setSelectedCustomerId}
            onAddCustomer={() => setCustomerModal(true)}
            onEditCustomer={(c) => setCustomerModal(c)}
            onDeleteCustomer={deleteCustomer}
            onJumpToJob={jumpToJobDate}
            onAddJobForCustomer={(customerId) => setJobModal({ date: todayStr(), jobId: null, presetCustomerId: customerId })}
            onOpenJob={(dateStr, jobId) => setJobModal({ date: dateStr, jobId })}
            onUpdatePricingNote={updatePricingNote}
            onSavePricingOverride={savePricingOverride}
            onDeletePricingOverride={deletePricingOverride}
          />
        )}
      </div>

      {/* Bottom business tabs — kept minimal for the common single-business case;
          the full Excel-style tab strip only appears once there's a second business,
          so a new buyer isn't shown a tab-switching concept they don't need on day one. */}
      {businesses.length === 1 ? (
        <div className="shrink-0 flex items-center bg-ink-100 border-t border-ink-300 px-3 py-1.5">
          <button
            onClick={addBusiness}
            className="flex items-center gap-1 text-xs text-ink-500 hover:text-ink-800 transition"
          >
            <Plus size={12} /> Add another business
          </button>
        </div>
      ) : (
      <div className="shrink-0 flex items-end gap-0.5 bg-ink-100 border-t border-ink-300 px-2 pt-1.5 overflow-x-auto">
        {businesses.map((biz) => {
          const active = biz.id === activeBusinessId;
          return (
            <div
              key={biz.id}
              onClick={() => {
                setActiveBusinessId(biz.id);
                setSelectedCustomerId(null);
              }}
              onDoubleClick={() => setRenamingTab(biz.id)}
              className={`group relative flex items-center gap-1.5 px-3.5 py-2 text-sm cursor-pointer select-none rounded-t-md border border-b-0 ${
                active
                  ? "bg-white text-ink-900 font-medium border-ink-300"
                  : "bg-ink-200 text-ink-500 border-transparent hover:bg-ink-50"
              }`}
              style={{ minWidth: 90 }}
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: biz.color }} />
              {renamingTab === biz.id ? (
                <input
                  autoFocus
                  defaultValue={biz.name}
                  onBlur={(e) => {
                    renameBusiness(biz.id, e.target.value);
                    setRenamingTab(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.target.blur();
                    if (e.key === "Escape") setRenamingTab(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-24 bg-transparent border-b border-ink-400 outline-none text-sm"
                />
              ) : (
                <span className="whitespace-nowrap">{biz.name}</span>
              )}
              {businesses.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteBusiness(biz.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-ink-400 hover:text-rose-600 transition"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          );
        })}
        <button
          onClick={addBusiness}
          title="Add business"
          className="flex items-center justify-center w-7 h-7 mb-1 ml-1 rounded-md text-ink-500 hover:bg-white hover:text-ink-800 transition"
        >
          <Plus size={16} />
        </button>
      </div>
      )}

      {jobModal && (
        <JobModal
          initial={jobModal}
          customers={customers}
          jobs={jobs}
          onClose={() => setJobModal(null)}
          onSave={(jobsToSave) => {
            addOrUpdateJobs(jobsToSave);
            setJobModal(null);
          }}
          onDelete={(id) => {
            deleteJob(id);
            setJobModal(null);
          }}
          onCreateCustomer={(customer) => addOrUpdateCustomer(customer)}
          onJumpToCustomer={jumpToCustomer}
        />
      )}

      {customerModal && (
        <CustomerModal
          initial={customerModal === true ? null : customerModal}
          onClose={() => setCustomerModal(false)}
          onSave={(c) => {
            addOrUpdateCustomer(c);
            setCustomerModal(false);
          }}
        />
      )}

      {aboutOpen && (
        <AboutPanel
          version={version}
          status={licenseStatus}
          updateStatus={updateStatus}
          onInstallUpdate={installUpdateNow}
          onClose={() => setAboutOpen(false)}
          onRefresh={() => refreshLicenseStatus({ force: true })}
          onActivated={(status) => setLicenseStatus(status)}
          onExport={exportToExcel}
        />
      )}
    </div>
  );
}

// ---------- License gate (shown when trial has expired or license isn't active) ----------
function AccessGate({ status, version, onActivated }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [activating, setActivating] = useState(false);

  const wasLicensed = !!status.licenseStatus; // had a key that's no longer active, vs. trial simply running out

  const handleActivate = async () => {
    if (!key.trim()) return;
    setActivating(true);
    setError("");
    try {
      const result = await api.activateLicense(key.trim());
      onActivated(result.status);
    } catch (e) {
      setError(e.message || "Couldn't activate that license key.");
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className="w-full h-screen flex items-center justify-center bg-ink-50 p-6">
      <div className="max-w-sm w-full bg-white rounded-xl shadow-xl p-6 flex flex-col gap-4">
        <Logo size={24} className="self-start" />
        <div className="flex items-center gap-2 text-ink-900">
          <Lock size={18} />
          <h1 className="text-base font-semibold">
            {wasLicensed ? "Your license isn't active" : "Your free trial has ended"}
          </h1>
        </div>
        <p className="text-sm text-ink-500">
          {wasLicensed
            ? `Lemon Squeezy reports this license as "${status.licenseStatus}". Enter a valid license key to keep using Site Sparrow.`
            : "Enter the license key from your purchase confirmation email to keep using Site Sparrow."}
        </p>
        <div>
          <label className="text-xs font-medium text-ink-500">License key</label>
          <input
            autoFocus
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleActivate()}
            placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
            className="w-full mt-1 px-2.5 py-1.5 text-sm rounded-md border border-ink-200 outline-none focus:border-ink-400"
          />
        </div>
        {error && <div className="text-xs text-rose-600">{error}</div>}
        <button
          onClick={handleActivate}
          disabled={!key.trim() || activating}
          className="text-sm px-3.5 py-2 rounded-md bg-ink-900 text-white hover:bg-ink-800 disabled:opacity-40"
        >
          {activating ? "Activating…" : "Activate"}
        </button>
        <div className="text-xs text-ink-400 text-center">v{version || "…"}</div>
      </div>
    </div>
  );
}

// ---------- First-run onboarding ----------
function Onboarding({ status, onDone }) {
  return (
    <div className="w-full h-screen flex items-center justify-center bg-ink-50 p-6">
      <div className="max-w-md w-full bg-white rounded-xl shadow-xl p-7 flex flex-col gap-4">
        <Logo size={32} className="self-start" alt="" />
        <h1 className="text-lg font-semibold text-ink-900">Welcome to Site Sparrow</h1>
        <p className="text-sm text-ink-600">
          A calendar, customer records, and job history for your trade business — booking, CRM, and
          business-profile notes, all in one place.
        </p>
        {status.mode === "trial" ? (
          <p className="text-sm text-ink-600">
            Your 14-day free trial starts now — <strong>{status.trial.daysLeft} days left</strong>. Activate a
            license key any time from the small version link in the top bar.
          </p>
        ) : (
          <p className="text-sm text-ink-600">You're fully licensed — thanks for buying Site Sparrow.</p>
        )}
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <ShieldCheck size={16} className="text-amber-700 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800">
            Your data lives only on this PC, in a local file. Back it up anytime with the{" "}
            <span className="font-medium">Export to Excel</span> button — it's worth doing regularly.
          </p>
        </div>
        <button
          onClick={onDone}
          className="text-sm px-3.5 py-2 rounded-md bg-ink-900 text-white hover:bg-ink-800 self-start"
        >
          Get started
        </button>
      </div>
    </div>
  );
}

// ---------- About / license panel ----------
function AboutPanel({ version, status, updateStatus, onInstallUpdate, onClose, onRefresh, onActivated, onExport }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleActivate = async () => {
    if (!key.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.activateLicense(key.trim());
      onActivated(result.status);
      setKey("");
    } catch (e) {
      setError(e.message || "Couldn't activate that license key.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeactivate = async () => {
    if (!window.confirm("Deactivate the license on this device? You can activate it again here or on another PC.")) return;
    setBusy(true);
    try {
      const fresh = await api.deactivateLicense();
      onActivated(fresh);
    } finally {
      setBusy(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const statusLine = (() => {
    if (status.mode === "licensed") return { text: "Licensed", tone: "text-sparrow-700" };
    if (status.mode === "trial") return { text: `Free trial — ${status.trial.daysLeft} days left`, tone: "text-ink-700" };
    if (status.mode === "license_inactive") return { text: `License ${status.licenseStatus || "inactive"}`, tone: "text-rose-600" };
    return { text: "Trial expired", tone: "text-rose-600" };
  })();

  return (
    <Modal onClose={onClose} title="About Site Sparrow">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2.5">
          <Logo variant="mark" size={20} alt="" />
          <div className="text-xs text-ink-400">Version v{version || "…"}</div>
        </div>

        {updateStatus?.updateDownloaded ? (
          <div className="flex items-center justify-between gap-2 bg-ink-100 border border-ink-200 rounded-lg p-2.5">
            <span className="text-xs text-ink-800">Version {updateStatus.version} is ready to install.</span>
            <button
              onClick={onInstallUpdate}
              className="text-xs px-2 py-1 rounded-md bg-ink-900 text-white hover:bg-ink-800 shrink-0"
            >
              Restart now
            </button>
          </div>
        ) : updateStatus?.updateAvailable ? (
          <div className="text-xs text-ink-500">Downloading version {updateStatus.version}…</div>
        ) : null}

        <div className={`text-sm font-medium ${statusLine.tone}`}>{statusLine.text}</div>
        {status.lastCheckError === "offline" && (
          <div className="text-xs text-amber-700 flex items-center gap-1">
            <AlertTriangle size={11} /> Couldn't reach Lemon Squeezy to re-check — using the last confirmed status.
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-ink-500">License key</label>
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Enter a license key to activate or switch"
            className="w-full mt-1 px-2.5 py-1.5 text-sm rounded-md border border-ink-200 outline-none focus:border-ink-400"
          />
        </div>
        {error && <div className="text-xs text-rose-600">{error}</div>}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleActivate}
            disabled={!key.trim() || busy}
            className="text-xs px-2.5 py-1.5 rounded-md bg-ink-900 text-white hover:bg-ink-800 disabled:opacity-40"
          >
            Activate
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing || status.mode === "trial"}
            className="text-xs px-2.5 py-1.5 rounded-md text-ink-600 border border-ink-200 hover:bg-ink-50 disabled:opacity-40"
          >
            {refreshing ? "Checking…" : "Check license now"}
          </button>
          {status.mode === "licensed" && (
            <button
              onClick={handleDeactivate}
              disabled={busy}
              className="text-xs px-2.5 py-1.5 rounded-md text-rose-600 border border-rose-200 hover:bg-rose-50 disabled:opacity-40"
            >
              Deactivate this device
            </button>
          )}
        </div>

        <div className="border-t border-ink-100 pt-3 flex items-start gap-2">
          <ShieldCheck size={14} className="text-ink-400 mt-0.5 shrink-0" />
          <div className="text-xs text-ink-500">
            Your data lives only on this PC. Back it up regularly.
            <button onClick={onExport} className="ml-1 text-sparrow-700 hover:underline font-medium">
              Export to Excel now
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Calendar view ----------
function CalendarView({ jobs, customers, month, year, setMonth, setYear, onOpenJob, onJumpToCustomer, weekExportDate, setWeekExportDate, onExportWeek }) {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const jobsByDate = useMemo(() => {
    const map = {};
    jobs.forEach((j) => {
      if (!map[j.date]) map[j.date] = [];
      map[j.date].push(j);
    });
    Object.values(map).forEach((dayJobs) => dayJobs.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)));
    return map;
  }, [jobs]);

  const custName = (id) => customers.find((c) => c.id === id)?.name || "Unknown";

  const goPrev = () => {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else setMonth(month - 1);
  };
  const goNext = () => {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else setMonth(month + 1);
  };

  const monthLabel = new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="h-full flex flex-col p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button onClick={goPrev} className="p-1.5 rounded-md hover:bg-ink-200 transition">
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-sm font-semibold text-ink-800 w-40">{monthLabel}</h2>
          <button onClick={goNext} className="p-1.5 rounded-md hover:bg-ink-200 transition">
            <ChevronRight size={16} />
          </button>
          <button
            onClick={() => {
              const t = new Date();
              setMonth(t.getMonth());
              setYear(t.getFullYear());
            }}
            className="ml-2 text-xs text-ink-500 hover:text-ink-800 border border-ink-200 rounded-md px-2 py-1"
          >
            Today
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 border border-ink-200 rounded-md px-2 py-1 bg-white">
            <input
              type="date"
              value={weekExportDate}
              onChange={(e) => setWeekExportDate(e.target.value)}
              className="text-xs outline-none w-[118px]"
            />
            <button
              onClick={onExportWeek}
              title="Export the Mon–Sun week containing this date"
              className="flex items-center gap-1 text-xs font-medium text-ink-600 hover:text-ink-900 pl-1 border-l border-ink-200"
            >
              <Download size={12} /> Export week
            </button>
          </div>
          <button
            onClick={() => onOpenJob(todayStr(), null)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-ink-900 text-white hover:bg-ink-800 transition"
          >
            <Plus size={14} /> Add job
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 text-xs font-medium text-ink-400 mb-1 px-1">
        {DAY_LABELS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 flex-1 overflow-y-auto pb-2">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} className="rounded-lg bg-transparent" />;
          const dateStr = toDateStr(year, month, d);
          const dayJobs = jobsByDate[dateStr] || [];
          const isToday = dateStr === todayStr();
          return (
            <div
              key={i}
              className={`rounded-lg border p-1.5 flex flex-col min-h-[92px] bg-white ${
                isToday ? "border-ink-900" : "border-ink-200"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs ${isToday ? "font-bold text-ink-900" : "text-ink-500"}`}>{d}</span>
                <button
                  onClick={() => onOpenJob(dateStr, null)}
                  className="opacity-0 hover:opacity-100 focus:opacity-100 text-ink-400 hover:text-ink-800"
                >
                  <Plus size={12} />
                </button>
              </div>
              <div className="flex flex-col gap-1 overflow-y-auto">
                {dayJobs.slice(0, 3).map((j) => (
                  <button
                    key={j.id}
                    onClick={() => onOpenJob(dateStr, j.id)}
                    className="text-left text-[11px] leading-tight px-1.5 py-1 rounded border-l-2 border-sparrow-500 bg-sparrow-50 text-sparrow-800 hover:bg-sparrow-100 truncate"
                    title={`${formatTime12h(j.startTime)} — ${custName(j.customerId)} — ${j.service}`}
                  >
                    <div className="flex items-center gap-1 font-medium truncate">
                      <span className="text-sparrow-600 shrink-0">{formatTime12h(j.startTime)}</span>
                      <span className="truncate">{custName(j.customerId)}</span>
                    </div>
                    <div className="truncate text-sparrow-700">{j.service}</div>
                  </button>
                ))}
                {dayJobs.length > 3 && (
                  <span className="text-[10px] text-ink-400 px-1.5">+{dayJobs.length - 3} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- CRM view ----------
function CRMView({
  customers,
  jobs,
  interactionLogs,
  onAddInteractionLog,
  onDeleteInteractionLog,
  search,
  setSearch,
  selectedCustomerId,
  setSelectedCustomerId,
  onAddCustomer,
  onEditCustomer,
  onDeleteCustomer,
  onJumpToJob,
  onAddJobForCustomer,
  onOpenJob,
  onUpdatePricingNote,
  onSavePricingOverride,
  onDeletePricingOverride,
}) {
  const selected = customers.find((c) => c.id === selectedCustomerId) || null;
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [noteModalOpen, setNoteModalOpen] = useState(false);

  const activityLog = useMemo(() => {
    if (!selected) return [];
    const jobEntries = jobs
      .filter((j) => j.customerId === selected.id)
      .map((j) => ({ kind: "job", id: j.id, date: j.date, ...j }));
    const logEntries = (interactionLogs || [])
      .filter((l) => l.customerId === selected.id)
      .map((l) => ({ kind: l.type, id: l.id, date: l.date, text: l.text, subject: l.subject }));
    return [...jobEntries, ...logEntries].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [jobs, interactionLogs, selected]);

  return (
    <div className="h-full flex">
      {/* customer list */}
      <div className="w-[340px] shrink-0 border-r border-ink-200 flex flex-col bg-white">
        <div className="p-3 border-b border-ink-200 flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-2.5 text-ink-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customers…"
              className="w-full pl-7 pr-2 py-1.5 text-sm rounded-md border border-ink-200 outline-none focus:border-ink-400"
            />
          </div>
          <button
            onClick={onAddCustomer}
            className="flex items-center justify-center w-8 h-8 rounded-md bg-ink-900 text-white hover:bg-ink-800 transition shrink-0"
            title="Add customer"
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {customers.length === 0 && (
            <div className="p-4 text-sm text-ink-400">No customers yet. Add your first one.</div>
          )}
          {customers.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCustomerId(c.id)}
              className={`w-full text-left px-4 py-3 border-b border-ink-100 hover:bg-ink-50 transition ${
                selectedCustomerId === c.id ? "bg-sparrow-50" : ""
              }`}
            >
              <div className="text-sm font-medium text-ink-900">{c.name}</div>
              <div className="text-xs text-ink-500 mt-0.5 flex items-center gap-2">
                {c.phone && (
                  <span className="flex items-center gap-1">
                    <Phone size={10} /> {c.phone}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* detail panel */}
      <div className="flex-1 overflow-y-auto p-6">
        {!selected ? (
          <div className="h-full flex items-center justify-center text-sm text-ink-400">
            Select a customer to view their profile and job history.
          </div>
        ) : (
          <div className="max-w-2xl">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="text-lg font-semibold text-ink-900">{selected.name}</h2>
                <div className="flex items-center gap-4 mt-1.5 text-sm text-ink-500">
                  {selected.phone && (
                    <span className="flex items-center gap-1.5">
                      <Phone size={12} /> {selected.phone}
                    </span>
                  )}
                  {selected.email && (
                    <span className="flex items-center gap-1.5">
                      <Mail size={12} /> {selected.email}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onEditCustomer(selected)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-ink-600 border border-ink-200 hover:bg-ink-50"
                >
                  <Pencil size={12} /> Edit
                </button>
                <button
                  onClick={() => onDeleteCustomer(selected.id)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-rose-600 border border-rose-200 hover:bg-rose-50"
                >
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            </div>

            <CustomerPricingSection
              key={selected.id}
              customer={selected}
              onUpdateNote={(note) => onUpdatePricingNote(selected.id, note)}
              onSaveOverride={(override) => onSavePricingOverride(selected.id, override)}
              onDeleteOverride={onDeletePricingOverride}
            />

            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-ink-700">Activity log</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setNoteModalOpen(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-ink-600 border border-ink-200 hover:bg-ink-50"
                >
                  <StickyNote size={12} /> Note
                </button>
                <button
                  onClick={() => {
                    if (!selected.email) {
                      alert("Add an email address for this customer first.");
                      return;
                    }
                    setEmailModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-ink-600 border border-ink-200 hover:bg-ink-50"
                >
                  <Mail size={12} /> Email
                </button>
                <button
                  onClick={() => onAddJobForCustomer(selected.id)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-ink-900 text-white hover:bg-ink-800"
                >
                  <Plus size={12} /> Add job
                </button>
              </div>
            </div>

            {activityLog.length === 0 ? (
              <div className="text-sm text-ink-400 border border-dashed border-ink-200 rounded-lg p-6 text-center">
                Nothing logged yet for this customer.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {activityLog.map((entry) => (
                  <ActivityEntry
                    key={`${entry.kind}-${entry.id}`}
                    entry={entry}
                    onOpenJob={onOpenJob}
                    onJumpToJob={onJumpToJob}
                    onDeleteLog={onDeleteInteractionLog}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {noteModalOpen && (
        <NoteModal
          title={`Note — ${selected?.name || ""}`}
          onClose={() => setNoteModalOpen(false)}
          onSave={(text) => {
            onAddInteractionLog({ id: uid(), customerId: selected.id, date: todayStr(), type: "note", text });
            setNoteModalOpen(false);
          }}
        />
      )}

      {emailModalOpen && selected && (
        <EmailModal
          recipientEmail={selected.email}
          recipientName={selected.name}
          onClose={() => setEmailModalOpen(false)}
          onSend={(subject, body) => {
            onAddInteractionLog({
              id: uid(),
              customerId: selected.id,
              date: todayStr(),
              type: "email",
              subject,
              text: body,
            });
            setEmailModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ---------- Pricing section (CRM customer card) ----------
function CustomerPricingSection({ customer, onUpdateNote, onSaveOverride, onDeleteOverride }) {
  const [note, setNote] = useState(customer.pricingNote || "");
  const [newLabel, setNewLabel] = useState("");
  const [newPrice, setNewPrice] = useState("");

  const handleAddOverride = () => {
    const priceNum = Number(newPrice);
    if (!newLabel.trim() || !newPrice || !Number.isFinite(priceNum) || priceNum < 0) return;
    onSaveOverride({ id: uid(), serviceLabel: newLabel.trim(), price: priceNum });
    setNewLabel("");
    setNewPrice("");
  };

  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-ink-700 mb-3 flex items-center gap-1.5">
        <DollarSign size={14} /> Pricing
      </h3>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => onUpdateNote(note)}
        rows={2}
        placeholder="e.g. mate's rates, always negotiates 10% off, standard callout + $20 travel…"
        className="w-full px-2.5 py-1.5 text-sm rounded-md border border-ink-200 outline-none focus:border-ink-400 resize-none"
      />

      <div className="mt-3 flex flex-col gap-2">
        {(customer.pricingOverrides || []).length === 0 ? null : (
          <div className="text-xs font-medium text-ink-500">Per-service overrides</div>
        )}
        {(customer.pricingOverrides || []).map((o) => (
          <div key={o.id} className="flex items-center justify-between border border-ink-200 rounded-lg px-3 py-2">
            <span className="text-sm text-ink-800">{o.serviceLabel}</span>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-ink-900">${o.price.toFixed(2)}</span>
              <button onClick={() => onDeleteOverride(o.id)} className="text-ink-400 hover:text-rose-600" title="Remove">
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Service (e.g. Gutter clean)"
            className="flex-1 px-2.5 py-1.5 text-sm rounded-md border border-ink-200 outline-none focus:border-ink-400"
          />
          <input
            type="number"
            step="0.01"
            min="0"
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
            placeholder="Price"
            className="w-24 px-2.5 py-1.5 text-sm rounded-md border border-ink-200 outline-none focus:border-ink-400"
          />
          <button
            onClick={handleAddOverride}
            disabled={!newLabel.trim() || !newPrice}
            className="flex items-center justify-center w-8 h-8 rounded-md bg-ink-900 text-white hover:bg-ink-800 disabled:opacity-40 shrink-0"
            title="Add override"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ActivityEntry({ entry, onOpenJob, onJumpToJob, onDeleteLog }) {
  if (entry.kind === "job") {
    const j = entry;
    return (
      <div className="border border-ink-200 rounded-lg p-3 hover:border-ink-300 transition">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-2">
            <CalendarIcon size={13} className="text-ink-400 mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-medium text-ink-900">{j.service || "(no service set)"}</div>
              <div className="text-xs text-ink-500 mt-0.5">
                {formatLogDate(j.date)} · {formatTimeRange(j.startTime, j.durationMinutes)}
              </div>
              {j.notes && <div className="text-xs text-ink-600 mt-1.5 whitespace-pre-wrap">{j.notes}</div>}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => onOpenJob(j.date, j.id)} className="text-xs text-ink-500 hover:text-ink-900 flex items-center gap-1" title="Edit job">
              <Pencil size={11} />
            </button>
            <button onClick={() => onJumpToJob(j.date)} className="text-xs text-sparrow-700 hover:text-sparrow-900 flex items-center gap-1" title="View on calendar">
              <CalendarIcon size={11} /> <ArrowRight size={10} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isEmail = entry.kind === "email";
  return (
    <div className="border border-ink-200 rounded-lg p-3 hover:border-ink-300 transition bg-ink-50/50">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-2">
          {isEmail ? (
            <Mail size={13} className="text-ink-400 mt-0.5 shrink-0" />
          ) : (
            <StickyNote size={13} className="text-ink-400 mt-0.5 shrink-0" />
          )}
          <div>
            <div className="text-sm font-medium text-ink-900">
              {isEmail ? entry.subject || "(no subject)" : "Note"}
            </div>
            <div className="text-xs text-ink-500 mt-0.5">{formatLogDate(entry.date)}</div>
            {entry.text && <div className="text-xs text-ink-600 mt-1.5 whitespace-pre-wrap">{entry.text}</div>}
          </div>
        </div>
        <button onClick={() => onDeleteLog(entry.id)} className="text-xs text-ink-400 hover:text-rose-600 shrink-0" title="Remove">
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}

function formatLogDate(dateStr) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ---------- Business profile view ----------
function BusinessProfileView({ profile, businessId, onUpdate, onFilesChanged, onAddActivity, onDeleteActivity }) {
  const [local, setLocal] = useState(profile);
  const [uploading, setUploading] = useState(false);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const fileInputRef = useRef(null);

  const field = (key) => ({
    value: local[key] || "",
    onChange: (e) => setLocal((l) => ({ ...l, [key]: e.target.value })),
    onBlur: () => onUpdate({ [key]: local[key] }),
  });

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const accepted = [];
    for (const file of files) {
      if (file.size > 4 * 1024 * 1024) {
        alert(`"${file.name}" is over 4MB and was skipped. Keep uploads small — this is for reference docs/photos, not large files.`);
        continue;
      }
      accepted.push(file);
    }
    if (!accepted.length) return;
    setUploading(true);
    try {
      const saved = await api.uploadFiles(businessId, accepted);
      const updated = [...(local.fileRefs || []), ...saved];
      setLocal((l) => ({ ...l, fileRefs: updated }));
      onFilesChanged(updated);
    } catch (e) {
      alert("Couldn't upload the file(s). Try again.");
    } finally {
      setUploading(false);
    }
  };

  const downloadFile = (f) => {
    const a = document.createElement("a");
    a.href = api.fileDownloadUrl(f.id);
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const deleteFile = async (f) => {
    if (!window.confirm(`Remove "${f.name}"?`)) return;
    try {
      await api.deleteFile(f.id);
    } catch (e) {
      // ignore — still remove the reference
    }
    const updated = (local.fileRefs || []).filter((x) => x.id !== f.id);
    setLocal((l) => ({ ...l, fileRefs: updated }));
    onFilesChanged(updated);
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl flex flex-col gap-6">
        {/* Details */}
        <div>
          <h3 className="text-sm font-semibold text-ink-700 mb-3">Business details</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-ink-500">Address</label>
              <input {...field("address")} placeholder="Street, suburb" className="w-full mt-1 px-2.5 py-1.5 text-sm rounded-md border border-ink-200 outline-none focus:border-ink-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-500">Industry / trade</label>
              <input {...field("industry")} placeholder="e.g. Gutters, Solar, Landscaping" className="w-full mt-1 px-2.5 py-1.5 text-sm rounded-md border border-ink-200 outline-none focus:border-ink-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-500">Primary contact</label>
              <input {...field("contactName")} placeholder="Who you deal with" className="w-full mt-1 px-2.5 py-1.5 text-sm rounded-md border border-ink-200 outline-none focus:border-ink-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-500">Contact phone</label>
              <input {...field("contactPhone")} className="w-full mt-1 px-2.5 py-1.5 text-sm rounded-md border border-ink-200 outline-none focus:border-ink-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-500">Contact email</label>
              <input {...field("contactEmail")} className="w-full mt-1 px-2.5 py-1.5 text-sm rounded-md border border-ink-200 outline-none focus:border-ink-400" />
            </div>
          </div>
        </div>

        {/* Links */}
        <div>
          <h3 className="text-sm font-semibold text-ink-700 mb-3">Links</h3>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-medium text-ink-500 flex items-center gap-1.5">
                <MapPin size={11} /> Google Business Profile
              </label>
              <div className="flex items-center gap-2 mt-1">
                <input {...field("googleProfileUrl")} placeholder="https://g.page/…" className="flex-1 px-2.5 py-1.5 text-sm rounded-md border border-ink-200 outline-none focus:border-ink-400" />
                {local.googleProfileUrl && (
                  <a href={local.googleProfileUrl} target="_blank" rel="noreferrer" className="text-ink-400 hover:text-sparrow-700">
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-ink-500 flex items-center gap-1.5">
                <Globe size={11} /> Website
              </label>
              <div className="flex items-center gap-2 mt-1">
                <input {...field("websiteUrl")} placeholder="https://…" className="flex-1 px-2.5 py-1.5 text-sm rounded-md border border-ink-200 outline-none focus:border-ink-400" />
                {local.websiteUrl && (
                  <a href={local.websiteUrl} target="_blank" rel="noreferrer" className="text-ink-400 hover:text-sparrow-700">
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div>
          <h3 className="text-sm font-semibold text-ink-700 mb-3">Notes for when you're talking to them</h3>
          <textarea
            {...field("notes")}
            rows={5}
            placeholder="Context, preferences, what's been discussed, what they care about…"
            className="w-full px-2.5 py-1.5 text-sm rounded-md border border-ink-200 outline-none focus:border-ink-400 resize-none"
          />
        </div>

        {/* Activity */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-ink-700">Activity</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setNoteModalOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-ink-600 border border-ink-200 hover:bg-ink-50"
              >
                <StickyNote size={12} /> Note
              </button>
              <button
                onClick={() => {
                  if (!local.contactEmail) {
                    alert("Add a contact email for this business first.");
                    return;
                  }
                  setEmailModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-ink-600 border border-ink-200 hover:bg-ink-50"
              >
                <Mail size={12} /> Email
              </button>
            </div>
          </div>

          {(!local.activityLog || local.activityLog.length === 0) ? (
            <div className="text-sm text-ink-400 border border-dashed border-ink-200 rounded-lg p-6 text-center">
              No activity logged yet — notes and emails you send from here will show up as a timeline.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {local.activityLog
                .slice()
                .sort((a, b) => (a.date < b.date ? 1 : -1))
                .map((entry) => (
                  <div key={entry.id} className="border border-ink-200 rounded-lg p-3 hover:border-ink-300 transition bg-ink-50/50">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-2">
                        {entry.type === "email" ? (
                          <Mail size={13} className="text-ink-400 mt-0.5 shrink-0" />
                        ) : (
                          <StickyNote size={13} className="text-ink-400 mt-0.5 shrink-0" />
                        )}
                        <div>
                          <div className="text-sm font-medium text-ink-900">
                            {entry.type === "email" ? entry.subject || "(no subject)" : "Note"}
                          </div>
                          <div className="text-xs text-ink-500 mt-0.5">{formatLogDate(entry.date)}</div>
                          {entry.text && <div className="text-xs text-ink-600 mt-1.5 whitespace-pre-wrap">{entry.text}</div>}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          onDeleteActivity(entry.id);
                          setLocal((l) => ({ ...l, activityLog: (l.activityLog || []).filter((e) => e.id !== entry.id) }));
                        }}
                        className="text-xs text-ink-400 hover:text-rose-600 shrink-0"
                        title="Remove"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Files */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-ink-700">Files</h3>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-ink-900 text-white hover:bg-ink-800 disabled:opacity-50"
            >
              <Upload size={12} /> {uploading ? "Uploading…" : "Upload file"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {(!local.fileRefs || local.fileRefs.length === 0) ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFiles(e.dataTransfer.files);
              }}
              className="text-sm text-ink-400 border border-dashed border-ink-200 rounded-lg p-6 text-center"
            >
              Drop files here or click "Upload file" — contracts, photos, agreements, anything useful to have on hand.
            </div>
          ) : (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFiles(e.dataTransfer.files);
              }}
              className="flex flex-col gap-2"
            >
              {local.fileRefs.map((f) => (
                <div key={f.id} className="flex items-center justify-between border border-ink-200 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText size={14} className="text-ink-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm text-ink-800 truncate">{f.name}</div>
                      <div className="text-xs text-ink-400">
                        {humanFileSize(f.size)} · {new Date(f.uploadedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => downloadFile(f)} className="p-1.5 text-ink-400 hover:text-ink-800" title="Download">
                      <Download size={13} />
                    </button>
                    <button onClick={() => deleteFile(f)} className="p-1.5 text-ink-400 hover:text-rose-600" title="Remove">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {noteModalOpen && (
        <NoteModal
          title="Add note"
          onClose={() => setNoteModalOpen(false)}
          onSave={(text) => {
            const entry = { id: uid(), date: todayStr(), type: "note", text };
            onAddActivity(entry);
            setLocal((l) => ({ ...l, activityLog: [...(l.activityLog || []), entry] }));
            setNoteModalOpen(false);
          }}
        />
      )}

      {emailModalOpen && (
        <EmailModal
          recipientEmail={local.contactEmail}
          recipientName={local.contactName}
          onClose={() => setEmailModalOpen(false)}
          onSend={(subject, body) => {
            const entry = { id: uid(), date: todayStr(), type: "email", subject, text: body };
            onAddActivity(entry);
            setLocal((l) => ({ ...l, activityLog: [...(l.activityLog || []), entry] }));
            setEmailModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ---------- Job modal ----------
function JobModal({ initial, customers, jobs, onClose, onSave, onDelete, onCreateCustomer, onJumpToCustomer }) {
  const existingJob = initial.jobId ? jobs.find((j) => j.id === initial.jobId) : null;
  const [date, setDate] = useState(existingJob?.date || initial.date || todayStr());
  const [customerId, setCustomerId] = useState(existingJob?.customerId || initial.presetCustomerId || "");
  const [service, setService] = useState(existingJob?.service || "");
  const [notes, setNotes] = useState(existingJob?.notes || "");
  const [time, setTime] = useState(existingJob?.startTime || "09:00");
  const [durationKey, setDurationKey] = useState(
    durationOptionForMinutes(existingJob?.durationMinutes ?? 60).key
  );
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [ncName, setNcName] = useState("");
  const [ncPhone, setNcPhone] = useState("");
  const [ncEmail, setNcEmail] = useState("");
  const [custSearch, setCustSearch] = useState("");
  const [serviceListOpen, setServiceListOpen] = useState(false);

  const knownServices = useMemo(() => {
    const set = new Set(jobs.map((j) => (j.service || "").trim()).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [jobs]);
  const filteredServices = knownServices.filter((s) => s.toLowerCase().includes(service.toLowerCase()));

  const filteredCustomers = customers.filter((c) => c.name.toLowerCase().includes(custSearch.toLowerCase()));
  const selectedCustomer = customers.find((c) => c.id === customerId);

  // Multi-day options only make sense when creating a brand-new appointment —
  // editing one specific card shouldn't suddenly spawn extra cards.
  const durationChoices = existingJob ? DURATION_OPTIONS.filter((o) => !o.days) : DURATION_OPTIONS;
  const selectedDuration = DURATION_OPTIONS.find((o) => o.key === durationKey) || DURATION_OPTIONS[3];
  const effectiveMinutes = selectedDuration.days ? MULTI_DAY_CARD_MINUTES : selectedDuration.minutes;

  const overlaps = useMemo(() => {
    return jobs
      .filter((j) => j.date === date && j.id !== existingJob?.id)
      .filter((j) => timeRangesOverlap(time, effectiveMinutes, j.startTime, j.durationMinutes))
      .map((j) => ({ job: j, customerName: customers.find((c) => c.id === j.customerId)?.name || "Unknown" }));
  }, [jobs, date, time, effectiveMinutes, existingJob, customers]);

  const handleCreateCustomer = () => {
    if (!ncName.trim()) return;
    const id = uid();
    onCreateCustomer({ id, name: ncName.trim(), phone: ncPhone.trim(), email: ncEmail.trim() });
    setCustomerId(id);
    setShowNewCustomer(false);
    setNcName("");
    setNcPhone("");
    setNcEmail("");
  };

  const handleSave = () => {
    if (!customerId) return;
    const trimmedService = service.trim();
    const trimmedNotes = notes.trim();

    if (selectedDuration.days) {
      // "Nd" creates N independent job cards, one per consecutive date, each
      // a full-workday block at the same start time — not a single linked job.
      const cards = [];
      for (let i = 0; i < selectedDuration.days; i++) {
        cards.push({
          id: uid(),
          customerId,
          date: addDaysToDateStr(date, i),
          startTime: time,
          durationMinutes: MULTI_DAY_CARD_MINUTES,
          service: trimmedService,
          notes: trimmedNotes,
        });
      }
      onSave(cards);
      return;
    }

    onSave([
      {
        id: existingJob?.id || uid(),
        customerId,
        date,
        startTime: time,
        durationMinutes: selectedDuration.minutes,
        service: trimmedService,
        notes: trimmedNotes,
      },
    ]);
  };

  return (
    <Modal onClose={onClose} title={existingJob ? "Edit job" : "Add job"}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-ink-500">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full mt-1 px-2.5 py-1.5 text-sm rounded-md border border-ink-200 outline-none focus:border-ink-400"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-500">Start time</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full mt-1 px-2.5 py-1.5 text-sm rounded-md border border-ink-200 outline-none focus:border-ink-400"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-500">Duration</label>
            <select
              value={durationKey}
              onChange={(e) => setDurationKey(e.target.value)}
              className="w-full mt-1 px-2.5 py-1.5 text-sm rounded-md border border-ink-200 outline-none focus:border-ink-400 bg-white"
            >
              {durationChoices.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!selectedDuration.days && (
          <div className="text-xs text-ink-400 -mt-2 flex items-center gap-1">
            <Clock size={11} /> Ends {formatTime12h(minutesToTime(timeToMinutes(time) + effectiveMinutes))}
          </div>
        )}

        {overlaps.length > 0 && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
            <AlertTriangle size={14} className="text-amber-700 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-800">
              Overlaps with {overlaps.map((o) => `${o.customerName} (${formatTimeRange(o.job.startTime, o.job.durationMinutes)})`).join(", ")}. You can still save — this is just a heads up.
            </div>
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-ink-500">Customer</label>
          {selectedCustomer && !showNewCustomer ? (
            <div className="mt-1 flex items-center justify-between px-2.5 py-1.5 rounded-md border border-ink-200 bg-ink-50">
              <span className="text-sm">{selectedCustomer.name}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => onJumpToCustomer(selectedCustomer.id)} className="text-xs text-sparrow-700 hover:underline">
                  View profile
                </button>
                <button onClick={() => setCustomerId("")} className="text-xs text-ink-400 hover:text-ink-700">
                  Change
                </button>
              </div>
            </div>
          ) : showNewCustomer ? (
            <div className="mt-1 flex flex-col gap-2 p-2.5 rounded-md border border-ink-200 bg-ink-50">
              <input
                autoFocus
                placeholder="Name"
                value={ncName}
                onChange={(e) => setNcName(e.target.value)}
                className="px-2 py-1.5 text-sm rounded-md border border-ink-200 outline-none"
              />
              <input
                placeholder="Phone"
                value={ncPhone}
                onChange={(e) => setNcPhone(e.target.value)}
                className="px-2 py-1.5 text-sm rounded-md border border-ink-200 outline-none"
              />
              <input
                placeholder="Email"
                value={ncEmail}
                onChange={(e) => setNcEmail(e.target.value)}
                className="px-2 py-1.5 text-sm rounded-md border border-ink-200 outline-none"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreateCustomer}
                  className="text-xs px-2.5 py-1.5 rounded-md bg-ink-900 text-white hover:bg-ink-800"
                >
                  Create & select
                </button>
                <button onClick={() => setShowNewCustomer(false)} className="text-xs text-ink-500 hover:text-ink-800">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-1">
              <input
                placeholder="Search existing customers…"
                value={custSearch}
                onChange={(e) => setCustSearch(e.target.value)}
                className="w-full px-2.5 py-1.5 text-sm rounded-md border border-ink-200 outline-none focus:border-ink-400"
              />
              <div className="max-h-32 overflow-y-auto mt-1 border border-ink-100 rounded-md">
                {filteredCustomers.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCustomerId(c.id)}
                    className="w-full text-left px-2.5 py-1.5 text-sm hover:bg-ink-50 border-b border-ink-50 last:border-0"
                  >
                    {c.name}
                  </button>
                ))}
                {filteredCustomers.length === 0 && (
                  <div className="px-2.5 py-2 text-xs text-ink-400">No matches.</div>
                )}
              </div>
              <button
                onClick={() => setShowNewCustomer(true)}
                className="mt-1.5 text-xs text-sparrow-700 hover:underline flex items-center gap-1"
              >
                <Plus size={11} /> New customer
              </button>
            </div>
          )}
        </div>

        <div className="relative">
          <label className="text-xs font-medium text-ink-500">Job / service</label>
          <input
            value={service}
            onChange={(e) => setService(e.target.value)}
            onFocus={() => setServiceListOpen(true)}
            onBlur={() => setTimeout(() => setServiceListOpen(false), 150)}
            placeholder="e.g. Roof inspection, Gutter clean"
            className="w-full mt-1 px-2.5 py-1.5 text-sm rounded-md border border-ink-200 outline-none focus:border-ink-400"
          />
          {serviceListOpen && filteredServices.length > 0 && (
            <div className="absolute z-10 left-0 right-0 mt-1 max-h-36 overflow-y-auto border border-ink-200 rounded-md bg-white shadow-md">
              {filteredServices.map((s) => (
                <button
                  key={s}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setService(s);
                    setServiceListOpen(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 text-sm hover:bg-ink-50 border-b border-ink-50 last:border-0"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-ink-500">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full mt-1 px-2.5 py-1.5 text-sm rounded-md border border-ink-200 outline-none focus:border-ink-400 resize-none"
          />
        </div>

        <div className="flex items-center justify-between pt-2">
          {existingJob ? (
            <button
              onClick={() => onDelete(existingJob.id)}
              className="text-xs text-rose-600 hover:text-rose-800 flex items-center gap-1"
            >
              <Trash2 size={12} /> Delete job
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-md text-ink-600 hover:bg-ink-100">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!customerId}
              className="text-sm px-3.5 py-1.5 rounded-md bg-ink-900 text-white hover:bg-ink-800 disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Customer modal ----------
function CustomerModal({ initial, onClose, onSave }) {
  const [name, setName] = useState(initial?.name || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [email, setEmail] = useState(initial?.email || "");

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      id: initial?.id || uid(),
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      // preserved as-is — this modal only edits identity fields, not pricing
      pricingNote: initial?.pricingNote || "",
    });
  };

  return (
    <Modal onClose={onClose} title={initial ? "Edit customer" : "Add customer"}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-medium text-ink-500">Name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full mt-1 px-2.5 py-1.5 text-sm rounded-md border border-ink-200 outline-none focus:border-ink-400"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-ink-500">Phone</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full mt-1 px-2.5 py-1.5 text-sm rounded-md border border-ink-200 outline-none focus:border-ink-400"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-ink-500">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full mt-1 px-2.5 py-1.5 text-sm rounded-md border border-ink-200 outline-none focus:border-ink-400"
          />
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-md text-ink-600 hover:bg-ink-100">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="text-sm px-3.5 py-1.5 rounded-md bg-ink-900 text-white hover:bg-ink-800 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Note modal (shared: customer activity + business activity) ----------
function NoteModal({ title = "Add note", onClose, onSave }) {
  const [text, setText] = useState("");
  return (
    <Modal onClose={onClose} title={title}>
      <div className="flex flex-col gap-4">
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder="What do you need to remember?"
          className="w-full px-2.5 py-1.5 text-sm rounded-md border border-ink-200 outline-none focus:border-ink-400 resize-none"
        />
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-md text-ink-600 hover:bg-ink-100">
            Cancel
          </button>
          <button
            onClick={() => text.trim() && onSave(text.trim())}
            disabled={!text.trim()}
            className="text-sm px-3.5 py-1.5 rounded-md bg-ink-900 text-white hover:bg-ink-800 disabled:opacity-40"
          >
            Save note
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Email modal (shared: customer activity + business activity) ----------
function EmailModal({ recipientEmail, recipientName, onClose, onSend }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const handleSend = () => {
    if (!recipientEmail) return;
    const mailto = `mailto:${encodeURIComponent(recipientEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    onSend(subject, body);
  };

  return (
    <Modal onClose={onClose} title={`Email — ${recipientName || recipientEmail}`}>
      <div className="flex flex-col gap-4">
        <div className="text-xs text-ink-500">
          Opens your default email app addressed to <span className="font-medium">{recipientEmail}</span>, and logs it here once sent.
        </div>
        <div>
          <label className="text-xs font-medium text-ink-500">Subject</label>
          <input
            autoFocus
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full mt-1 px-2.5 py-1.5 text-sm rounded-md border border-ink-200 outline-none focus:border-ink-400"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-ink-500">Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            className="w-full mt-1 px-2.5 py-1.5 text-sm rounded-md border border-ink-200 outline-none focus:border-ink-400 resize-none"
          />
        </div>
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-md text-ink-600 hover:bg-ink-100">
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={!subject.trim() && !body.trim()}
            className="flex items-center gap-1.5 text-sm px-3.5 py-1.5 rounded-md bg-ink-900 text-white hover:bg-ink-800 disabled:opacity-40"
          >
            <Send size={12} /> Open & log
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- generic modal shell ----------
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-ink-900/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
