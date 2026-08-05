import React, { useState, useEffect, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import { Plus, X, Search, Phone, Mail, Calendar as CalendarIcon, Users, Download, ChevronLeft, ChevronRight, Pencil, Trash2, ArrowRight, Building2, Upload, FileText, ExternalLink, Globe, MapPin, Paperclip, StickyNote, Send } from "lucide-react";

// ---------- constants ----------
const TAB_COLORS = ["#0F766E", "#B45309", "#6D28D9", "#BE123C", "#1D4ED8", "#166534"];
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const STORAGE_KEY = "trade-scheduler-app-state-v1";

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

function emptyProfile() {
  return {
    address: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    industry: "",
    googleProfileUrl: "",
    websiteUrl: "",
    notes: "",
    fileRefs: [],
    activityLog: [],
  };
}

function defaultState() {
  const bizId = uid();
  return {
    businesses: [{ id: bizId, name: "Business 1", color: TAB_COLORS[0] }],
    customers: { [bizId]: [] },
    jobs: { [bizId]: [] },
    interactionLogs: { [bizId]: [] },
    businessProfiles: { [bizId]: emptyProfile() },
    activeBusinessId: bizId,
  };
}

function humanFileSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------- main component ----------
export default function TradeSchedulerCRM() {
  const [state, setState] = useState(null);
  const [loaded, setLoaded] = useState(false);
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
  const saveTimer = useRef(null);

  // ---- load ----
  useEffect(() => {
    (async () => {
      try {
        const result = await window.storage.get(STORAGE_KEY, false);
        if (result && result.value) {
          const parsed = JSON.parse(result.value);
          if (!parsed.businessProfiles) parsed.businessProfiles = {};
          if (!parsed.interactionLogs) parsed.interactionLogs = {};
          parsed.businesses.forEach((b) => {
            if (!parsed.businessProfiles[b.id]) parsed.businessProfiles[b.id] = emptyProfile();
            if (!parsed.businessProfiles[b.id].activityLog) parsed.businessProfiles[b.id].activityLog = [];
            if (!parsed.interactionLogs[b.id]) parsed.interactionLogs[b.id] = [];
          });
          setState(parsed);
        } else {
          setState(defaultState());
        }
      } catch (e) {
        setState(defaultState());
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // ---- debounced save ----
  useEffect(() => {
    if (!loaded || !state) return;
    setSaveStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await window.storage.set(STORAGE_KEY, JSON.stringify(state), false);
        setSaveStatus("saved");
      } catch (e) {
        setSaveStatus("error");
      }
    }, 500);
    return () => clearTimeout(saveTimer.current);
  }, [state, loaded]);

  if (!loaded || !state) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-[#F5F6F8] text-slate-500 text-sm">
        Loading your workspace…
      </div>
    );
  }

  const activeBiz = state.businesses.find((b) => b.id === state.activeBusinessId) || state.businesses[0];
  const customers = state.customers[activeBiz.id] || [];
  const jobs = state.jobs[activeBiz.id] || [];
  const interactionLogs = state.interactionLogs[activeBiz.id] || [];

  // ---------- mutation helpers ----------
  const updateState = (fn) => setState((prev) => fn(structuredClone(prev)));

  const addBusiness = () => {
    updateState((s) => {
      const id = uid();
      const color = TAB_COLORS[s.businesses.length % TAB_COLORS.length];
      s.businesses.push({ id, name: `Business ${s.businesses.length + 1}`, color });
      s.customers[id] = [];
      s.jobs[id] = [];
      s.businessProfiles[id] = emptyProfile();
      s.interactionLogs[id] = [];
      s.activeBusinessId = id;
      return s;
    });
  };

  const renameBusiness = (id, name) => {
    updateState((s) => {
      const b = s.businesses.find((x) => x.id === id);
      if (b) b.name = name.trim() || b.name;
      return s;
    });
  };

  const deleteBusiness = (id) => {
    if (state.businesses.length === 1) return;
    if (!window.confirm("Delete this business and all its customers, jobs, and files? This can't be undone.")) return;
    const filesToRemove = (state.businessProfiles[id]?.fileRefs || []).map((f) => f.id);
    updateState((s) => {
      s.businesses = s.businesses.filter((b) => b.id !== id);
      delete s.customers[id];
      delete s.jobs[id];
      delete s.businessProfiles[id];
      delete s.interactionLogs[id];
      if (s.activeBusinessId === id) s.activeBusinessId = s.businesses[0].id;
      return s;
    });
    filesToRemove.forEach((fid) => {
      window.storage.delete(`file-content:${fid}`, false).catch(() => {});
    });
  };

  const updateBusinessProfile = (bizId, patch) => {
    updateState((s) => {
      s.businessProfiles[bizId] = { ...s.businessProfiles[bizId], ...patch };
      return s;
    });
  };

  const addBusinessActivity = (bizId, entry) => {
    updateState((s) => {
      const prof = s.businessProfiles[bizId];
      prof.activityLog = [...(prof.activityLog || []), entry];
      return s;
    });
  };

  const deleteBusinessActivity = (bizId, entryId) => {
    updateState((s) => {
      const prof = s.businessProfiles[bizId];
      prof.activityLog = (prof.activityLog || []).filter((e) => e.id !== entryId);
      return s;
    });
  };

  const addInteractionLog = (entry) => {
    updateState((s) => {
      s.interactionLogs[activeBiz.id] = [...(s.interactionLogs[activeBiz.id] || []), entry];
      return s;
    });
  };

  const deleteInteractionLog = (entryId) => {
    updateState((s) => {
      s.interactionLogs[activeBiz.id] = (s.interactionLogs[activeBiz.id] || []).filter((e) => e.id !== entryId);
      return s;
    });
  };

  const addOrUpdateCustomer = (customer) => {
    updateState((s) => {
      const list = s.customers[activeBiz.id];
      const idx = list.findIndex((c) => c.id === customer.id);
      if (idx >= 0) list[idx] = customer;
      else list.push(customer);
      return s;
    });
  };

  const deleteCustomer = (id) => {
    if (!window.confirm("Delete this customer and their job history?")) return;
    updateState((s) => {
      s.customers[activeBiz.id] = s.customers[activeBiz.id].filter((c) => c.id !== id);
      s.jobs[activeBiz.id] = s.jobs[activeBiz.id].filter((j) => j.customerId !== id);
      return s;
    });
    setSelectedCustomerId(null);
  };

  const addOrUpdateJob = (job) => {
    updateState((s) => {
      const list = s.jobs[activeBiz.id];
      const idx = list.findIndex((j) => j.id === job.id);
      if (idx >= 0) list[idx] = job;
      else list.push(job);
      return s;
    });
  };

  const deleteJob = (id) => {
    updateState((s) => {
      s.jobs[activeBiz.id] = s.jobs[activeBiz.id].filter((j) => j.id !== id);
      return s;
    });
  };

  // ---------- export ----------
  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();
    state.businesses.forEach((biz) => {
      const custs = state.customers[biz.id] || [];
      const jbs = state.jobs[biz.id] || [];
      const prof = state.businessProfiles[biz.id] || emptyProfile();

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
      }));
      const custSheet = XLSX.utils.json_to_sheet(custRows.length ? custRows : [{ Name: "", Phone: "", Email: "", "Jobs on file": "" }]);
      XLSX.utils.book_append_sheet(wb, custSheet, safeSheetName(`${biz.name} Customers`));

      const jobRows = jbs
        .slice()
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .map((j) => {
          const cust = custs.find((c) => c.id === j.customerId);
          return {
            Date: j.date,
            Customer: cust ? cust.name : "(deleted customer)",
            Phone: cust ? cust.phone : "",
            "Job / Service": j.service,
            Notes: j.notes,
          };
        });
      const jobSheet = XLSX.utils.json_to_sheet(jobRows.length ? jobRows : [{ Date: "", Customer: "", Phone: "", "Job / Service": "", Notes: "" }]);
      XLSX.utils.book_append_sheet(wb, jobSheet, safeSheetName(`${biz.name} Jobs`));

      const logs = state.interactionLogs[biz.id] || [];
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
    XLSX.writeFile(wb, `scheduler-export-${todayStr()}.xlsx`);
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
      const dayJobs = jobs.filter((j) => j.date === dateStr);
      if (dayJobs.length === 0) {
        rows.push({ Day: dayLabel, Date: dateStr, Customer: "", Phone: "", "Job / Service": "", Notes: "" });
      } else {
        dayJobs.forEach((j) => {
          const cust = customers.find((c) => c.id === j.customerId);
          rows.push({
            Day: dayLabel,
            Date: dateStr,
            Customer: cust ? cust.name : "(deleted customer)",
            Phone: cust ? cust.phone : "",
            "Job / Service": j.service,
            Notes: j.notes,
          });
        });
      }
    }
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet["!cols"] = [{ wch: 11 }, { wch: 11 }, { wch: 20 }, { wch: 14 }, { wch: 24 }, { wch: 30 }];
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
    <div className="w-full h-screen flex flex-col bg-[#F5F6F8] text-slate-800 font-sans">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: activeBiz.color }} />
          <h1 className="text-[15px] font-semibold tracking-tight text-slate-900">{activeBiz.name}</h1>
          <span className="text-xs text-slate-400">
            {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            <button
              onClick={() => setView("calendar")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                view === "calendar" ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <CalendarIcon size={14} /> Calendar
            </button>
            <button
              onClick={() => setView("crm")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                view === "crm" ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Users size={14} /> CRM
            </button>
            <button
              onClick={() => setView("profile")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                view === "profile" ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Building2 size={14} /> Business Profile
            </button>
          </div>
          <button
            onClick={exportToExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition"
          >
            <Download size={14} /> Export to Excel
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {view === "profile" ? (
          <BusinessProfileView
            key={activeBiz.id}
            profile={state.businessProfiles[activeBiz.id] || emptyProfile()}
            onUpdate={(patch) => updateBusinessProfile(activeBiz.id, patch)}
            onAddActivity={(entry) => addBusinessActivity(activeBiz.id, entry)}
            onDeleteActivity={(entryId) => deleteBusinessActivity(activeBiz.id, entryId)}
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
          />
        )}
      </div>

      {/* Bottom Excel-style business tabs */}
      <div className="shrink-0 flex items-end gap-0.5 bg-[#E7E9ED] border-t border-slate-300 px-2 pt-1.5 overflow-x-auto">
        {state.businesses.map((biz) => {
          const active = biz.id === state.activeBusinessId;
          return (
            <div
              key={biz.id}
              onClick={() => {
                updateState((s) => {
                  s.activeBusinessId = biz.id;
                  return s;
                });
                setSelectedCustomerId(null);
              }}
              onDoubleClick={() => setRenamingTab(biz.id)}
              className={`group relative flex items-center gap-1.5 px-3.5 py-2 text-sm cursor-pointer select-none rounded-t-md border border-b-0 ${
                active
                  ? "bg-white text-slate-900 font-medium border-slate-300"
                  : "bg-[#DCDFE4] text-slate-500 border-transparent hover:bg-[#EAECEF]"
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
                  className="w-24 bg-transparent border-b border-slate-400 outline-none text-sm"
                />
              ) : (
                <span className="whitespace-nowrap">{biz.name}</span>
              )}
              {state.businesses.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteBusiness(biz.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 transition"
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
          className="flex items-center justify-center w-7 h-7 mb-1 ml-1 rounded-md text-slate-500 hover:bg-white hover:text-slate-800 transition"
        >
          <Plus size={16} />
        </button>
      </div>

      {jobModal && (
        <JobModal
          initial={jobModal}
          customers={customers}
          jobs={jobs}
          onClose={() => setJobModal(null)}
          onSave={(job) => {
            addOrUpdateJob(job);
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
    </div>
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
          <button onClick={goPrev} className="p-1.5 rounded-md hover:bg-slate-200 transition">
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-sm font-semibold text-slate-800 w-40">{monthLabel}</h2>
          <button onClick={goNext} className="p-1.5 rounded-md hover:bg-slate-200 transition">
            <ChevronRight size={16} />
          </button>
          <button
            onClick={() => {
              const t = new Date();
              setMonth(t.getMonth());
              setYear(t.getFullYear());
            }}
            className="ml-2 text-xs text-slate-500 hover:text-slate-800 border border-slate-200 rounded-md px-2 py-1"
          >
            Today
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 border border-slate-200 rounded-md px-2 py-1 bg-white">
            <input
              type="date"
              value={weekExportDate}
              onChange={(e) => setWeekExportDate(e.target.value)}
              className="text-xs outline-none w-[118px]"
            />
            <button
              onClick={onExportWeek}
              title="Export the Mon–Sun week containing this date"
              className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 pl-1 border-l border-slate-200"
            >
              <Download size={12} /> Export week
            </button>
          </div>
          <button
            onClick={() => onOpenJob(todayStr(), null)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 transition"
          >
            <Plus size={14} /> Add job
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 text-xs font-medium text-slate-400 mb-1 px-1">
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
                isToday ? "border-slate-900" : "border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs ${isToday ? "font-bold text-slate-900" : "text-slate-500"}`}>{d}</span>
                <button
                  onClick={() => onOpenJob(dateStr, null)}
                  className="opacity-0 hover:opacity-100 focus:opacity-100 text-slate-400 hover:text-slate-800"
                >
                  <Plus size={12} />
                </button>
              </div>
              <div className="flex flex-col gap-1 overflow-y-auto">
                {dayJobs.slice(0, 3).map((j) => (
                  <button
                    key={j.id}
                    onClick={() => onOpenJob(dateStr, j.id)}
                    className="text-left text-[11px] leading-tight px-1.5 py-1 rounded bg-teal-50 text-teal-800 hover:bg-teal-100 truncate"
                    title={`${custName(j.customerId)} — ${j.service}`}
                  >
                    <div className="font-medium truncate">{custName(j.customerId)}</div>
                    <div className="truncate text-teal-700">{j.service}</div>
                  </button>
                ))}
                {dayJobs.length > 3 && (
                  <span className="text-[10px] text-slate-400 px-1.5">+{dayJobs.length - 3} more</span>
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
      <div className="w-[340px] shrink-0 border-r border-slate-200 flex flex-col bg-white">
        <div className="p-3 border-b border-slate-200 flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customers…"
              className="w-full pl-7 pr-2 py-1.5 text-sm rounded-md border border-slate-200 outline-none focus:border-slate-400"
            />
          </div>
          <button
            onClick={onAddCustomer}
            className="flex items-center justify-center w-8 h-8 rounded-md bg-slate-900 text-white hover:bg-slate-800 transition shrink-0"
            title="Add customer"
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {customers.length === 0 && (
            <div className="p-4 text-sm text-slate-400">No customers yet. Add your first one.</div>
          )}
          {customers.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCustomerId(c.id)}
              className={`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition ${
                selectedCustomerId === c.id ? "bg-teal-50" : ""
              }`}
            >
              <div className="text-sm font-medium text-slate-900">{c.name}</div>
              <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
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
          <div className="h-full flex items-center justify-center text-sm text-slate-400">
            Select a customer to view their profile and job history.
          </div>
        ) : (
          <div className="max-w-2xl">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{selected.name}</h2>
                <div className="flex items-center gap-4 mt-1.5 text-sm text-slate-500">
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
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50"
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

            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700">Activity log</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setNoteModalOpen(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50"
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
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50"
                >
                  <Mail size={12} /> Email
                </button>
                <button
                  onClick={() => onAddJobForCustomer(selected.id)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-slate-900 text-white hover:bg-slate-800"
                >
                  <Plus size={12} /> Add job
                </button>
              </div>
            </div>

            {activityLog.length === 0 ? (
              <div className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg p-6 text-center">
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

function ActivityEntry({ entry, onOpenJob, onJumpToJob, onDeleteLog }) {
  if (entry.kind === "job") {
    const j = entry;
    return (
      <div className="border border-slate-200 rounded-lg p-3 hover:border-slate-300 transition">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-2">
            <CalendarIcon size={13} className="text-teal-600 mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-medium text-slate-900">{j.service || "(no service set)"}</div>
              <div className="text-xs text-slate-500 mt-0.5">{formatLogDate(j.date)}</div>
              {j.notes && <div className="text-xs text-slate-600 mt-1.5 whitespace-pre-wrap">{j.notes}</div>}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => onOpenJob(j.date, j.id)} className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1" title="Edit job">
              <Pencil size={11} />
            </button>
            <button onClick={() => onJumpToJob(j.date)} className="text-xs text-teal-700 hover:text-teal-900 flex items-center gap-1" title="View on calendar">
              <CalendarIcon size={11} /> <ArrowRight size={10} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isEmail = entry.kind === "email";
  return (
    <div className="border border-slate-200 rounded-lg p-3 hover:border-slate-300 transition bg-slate-50/50">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-2">
          {isEmail ? (
            <Mail size={13} className="text-indigo-600 mt-0.5 shrink-0" />
          ) : (
            <StickyNote size={13} className="text-amber-600 mt-0.5 shrink-0" />
          )}
          <div>
            <div className="text-sm font-medium text-slate-900">
              {isEmail ? entry.subject || "(no subject)" : "Note"}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">{formatLogDate(entry.date)}</div>
            {entry.text && <div className="text-xs text-slate-600 mt-1.5 whitespace-pre-wrap">{entry.text}</div>}
          </div>
        </div>
        <button onClick={() => onDeleteLog(entry.id)} className="text-xs text-slate-400 hover:text-rose-600 shrink-0" title="Remove">
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
function BusinessProfileView({ profile, onUpdate, onAddActivity, onDeleteActivity }) {
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
    setUploading(true);
    const newRefs = [];
    for (const file of files) {
      if (file.size > 4 * 1024 * 1024) {
        alert(`"${file.name}" is over 4MB and was skipped. Keep uploads small — this is for reference docs/photos, not large files.`);
        continue;
      }
      try {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const fileId = uid();
        await window.storage.set(`file-content:${fileId}`, dataUrl, false);
        newRefs.push({ id: fileId, name: file.name, size: file.size, type: file.type, uploadedAt: new Date().toISOString() });
      } catch (e) {
        alert(`Couldn't upload "${file.name}". Try again.`);
      }
    }
    if (newRefs.length) {
      const updated = [...(profile.fileRefs || []), ...newRefs];
      setLocal((l) => ({ ...l, fileRefs: updated }));
      onUpdate({ fileRefs: updated });
    }
    setUploading(false);
  };

  const downloadFile = async (f) => {
    try {
      const result = await window.storage.get(`file-content:${f.id}`, false);
      if (!result) throw new Error("missing");
      const a = document.createElement("a");
      a.href = result.value;
      a.download = f.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      alert("Couldn't load that file — it may have been removed.");
    }
  };

  const deleteFile = async (f) => {
    if (!window.confirm(`Remove "${f.name}"?`)) return;
    try {
      await window.storage.delete(`file-content:${f.id}`, false);
    } catch (e) {
      // ignore — still remove the reference
    }
    const updated = (profile.fileRefs || []).filter((x) => x.id !== f.id);
    setLocal((l) => ({ ...l, fileRefs: updated }));
    onUpdate({ fileRefs: updated });
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl flex flex-col gap-6">
        {/* Details */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Business details</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-slate-500">Address</label>
              <input {...field("address")} placeholder="Street, suburb" className="w-full mt-1 px-2.5 py-1.5 text-sm rounded-md border border-slate-200 outline-none focus:border-slate-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Industry / trade</label>
              <input {...field("industry")} placeholder="e.g. Gutters, Solar, Landscaping" className="w-full mt-1 px-2.5 py-1.5 text-sm rounded-md border border-slate-200 outline-none focus:border-slate-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Primary contact</label>
              <input {...field("contactName")} placeholder="Who you deal with" className="w-full mt-1 px-2.5 py-1.5 text-sm rounded-md border border-slate-200 outline-none focus:border-slate-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Contact phone</label>
              <input {...field("contactPhone")} className="w-full mt-1 px-2.5 py-1.5 text-sm rounded-md border border-slate-200 outline-none focus:border-slate-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Contact email</label>
              <input {...field("contactEmail")} className="w-full mt-1 px-2.5 py-1.5 text-sm rounded-md border border-slate-200 outline-none focus:border-slate-400" />
            </div>
          </div>
        </div>

        {/* Links */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Links</h3>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <MapPin size={11} /> Google Business Profile
              </label>
              <div className="flex items-center gap-2 mt-1">
                <input {...field("googleProfileUrl")} placeholder="https://g.page/…" className="flex-1 px-2.5 py-1.5 text-sm rounded-md border border-slate-200 outline-none focus:border-slate-400" />
                {local.googleProfileUrl && (
                  <a href={local.googleProfileUrl} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-teal-700">
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <Globe size={11} /> Website
              </label>
              <div className="flex items-center gap-2 mt-1">
                <input {...field("websiteUrl")} placeholder="https://…" className="flex-1 px-2.5 py-1.5 text-sm rounded-md border border-slate-200 outline-none focus:border-slate-400" />
                {local.websiteUrl && (
                  <a href={local.websiteUrl} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-teal-700">
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Notes for when you're talking to them</h3>
          <textarea
            {...field("notes")}
            rows={5}
            placeholder="Context, preferences, what's been discussed, what they care about…"
            className="w-full px-2.5 py-1.5 text-sm rounded-md border border-slate-200 outline-none focus:border-slate-400 resize-none"
          />
        </div>

        {/* Activity */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700">Activity</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setNoteModalOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50"
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
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50"
              >
                <Mail size={12} /> Email
              </button>
            </div>
          </div>

          {(!local.activityLog || local.activityLog.length === 0) ? (
            <div className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg p-6 text-center">
              No activity logged yet — notes and emails you send from here will show up as a timeline.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {local.activityLog
                .slice()
                .sort((a, b) => (a.date < b.date ? 1 : -1))
                .map((entry) => (
                  <div key={entry.id} className="border border-slate-200 rounded-lg p-3 hover:border-slate-300 transition bg-slate-50/50">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-2">
                        {entry.type === "email" ? (
                          <Mail size={13} className="text-indigo-600 mt-0.5 shrink-0" />
                        ) : (
                          <StickyNote size={13} className="text-amber-600 mt-0.5 shrink-0" />
                        )}
                        <div>
                          <div className="text-sm font-medium text-slate-900">
                            {entry.type === "email" ? entry.subject || "(no subject)" : "Note"}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">{formatLogDate(entry.date)}</div>
                          {entry.text && <div className="text-xs text-slate-600 mt-1.5 whitespace-pre-wrap">{entry.text}</div>}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          onDeleteActivity(entry.id);
                          setLocal((l) => ({ ...l, activityLog: (l.activityLog || []).filter((e) => e.id !== entry.id) }));
                        }}
                        className="text-xs text-slate-400 hover:text-rose-600 shrink-0"
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
            <h3 className="text-sm font-semibold text-slate-700">Files</h3>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
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
              className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg p-6 text-center"
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
                <div key={f.id} className="flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText size={14} className="text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm text-slate-800 truncate">{f.name}</div>
                      <div className="text-xs text-slate-400">
                        {humanFileSize(f.size)} · {new Date(f.uploadedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => downloadFile(f)} className="p-1.5 text-slate-400 hover:text-slate-800" title="Download">
                      <Download size={13} />
                    </button>
                    <button onClick={() => deleteFile(f)} className="p-1.5 text-slate-400 hover:text-rose-600" title="Remove">
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
    onSave({
      id: existingJob?.id || uid(),
      customerId,
      date,
      service: service.trim(),
      notes: notes.trim(),
    });
  };

  return (
    <Modal onClose={onClose} title={existingJob ? "Edit job" : "Add job"}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-medium text-slate-500">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full mt-1 px-2.5 py-1.5 text-sm rounded-md border border-slate-200 outline-none focus:border-slate-400"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-500">Customer</label>
          {selectedCustomer && !showNewCustomer ? (
            <div className="mt-1 flex items-center justify-between px-2.5 py-1.5 rounded-md border border-slate-200 bg-slate-50">
              <span className="text-sm">{selectedCustomer.name}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => onJumpToCustomer(selectedCustomer.id)} className="text-xs text-teal-700 hover:underline">
                  View profile
                </button>
                <button onClick={() => setCustomerId("")} className="text-xs text-slate-400 hover:text-slate-700">
                  Change
                </button>
              </div>
            </div>
          ) : showNewCustomer ? (
            <div className="mt-1 flex flex-col gap-2 p-2.5 rounded-md border border-slate-200 bg-slate-50">
              <input
                autoFocus
                placeholder="Name"
                value={ncName}
                onChange={(e) => setNcName(e.target.value)}
                className="px-2 py-1.5 text-sm rounded-md border border-slate-200 outline-none"
              />
              <input
                placeholder="Phone"
                value={ncPhone}
                onChange={(e) => setNcPhone(e.target.value)}
                className="px-2 py-1.5 text-sm rounded-md border border-slate-200 outline-none"
              />
              <input
                placeholder="Email"
                value={ncEmail}
                onChange={(e) => setNcEmail(e.target.value)}
                className="px-2 py-1.5 text-sm rounded-md border border-slate-200 outline-none"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreateCustomer}
                  className="text-xs px-2.5 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-800"
                >
                  Create & select
                </button>
                <button onClick={() => setShowNewCustomer(false)} className="text-xs text-slate-500 hover:text-slate-800">
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
                className="w-full px-2.5 py-1.5 text-sm rounded-md border border-slate-200 outline-none focus:border-slate-400"
              />
              <div className="max-h-32 overflow-y-auto mt-1 border border-slate-100 rounded-md">
                {filteredCustomers.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCustomerId(c.id)}
                    className="w-full text-left px-2.5 py-1.5 text-sm hover:bg-slate-50 border-b border-slate-50 last:border-0"
                  >
                    {c.name}
                  </button>
                ))}
                {filteredCustomers.length === 0 && (
                  <div className="px-2.5 py-2 text-xs text-slate-400">No matches.</div>
                )}
              </div>
              <button
                onClick={() => setShowNewCustomer(true)}
                className="mt-1.5 text-xs text-teal-700 hover:underline flex items-center gap-1"
              >
                <Plus size={11} /> New customer
              </button>
            </div>
          )}
        </div>

        <div className="relative">
          <label className="text-xs font-medium text-slate-500">Job / service</label>
          <input
            value={service}
            onChange={(e) => setService(e.target.value)}
            onFocus={() => setServiceListOpen(true)}
            onBlur={() => setTimeout(() => setServiceListOpen(false), 150)}
            placeholder="e.g. Roof inspection, Gutter clean"
            className="w-full mt-1 px-2.5 py-1.5 text-sm rounded-md border border-slate-200 outline-none focus:border-slate-400"
          />
          {serviceListOpen && filteredServices.length > 0 && (
            <div className="absolute z-10 left-0 right-0 mt-1 max-h-36 overflow-y-auto border border-slate-200 rounded-md bg-white shadow-md">
              {filteredServices.map((s) => (
                <button
                  key={s}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setService(s);
                    setServiceListOpen(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 text-sm hover:bg-slate-50 border-b border-slate-50 last:border-0"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-slate-500">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full mt-1 px-2.5 py-1.5 text-sm rounded-md border border-slate-200 outline-none focus:border-slate-400 resize-none"
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
            <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-md text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!customerId}
              className="text-sm px-3.5 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40"
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
    onSave({ id: initial?.id || uid(), name: name.trim(), phone: phone.trim(), email: email.trim() });
  };

  return (
    <Modal onClose={onClose} title={initial ? "Edit customer" : "Add customer"}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-medium text-slate-500">Name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full mt-1 px-2.5 py-1.5 text-sm rounded-md border border-slate-200 outline-none focus:border-slate-400"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500">Phone</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full mt-1 px-2.5 py-1.5 text-sm rounded-md border border-slate-200 outline-none focus:border-slate-400"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full mt-1 px-2.5 py-1.5 text-sm rounded-md border border-slate-200 outline-none focus:border-slate-400"
          />
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-md text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="text-sm px-3.5 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40"
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
          className="w-full px-2.5 py-1.5 text-sm rounded-md border border-slate-200 outline-none focus:border-slate-400 resize-none"
        />
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-md text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button
            onClick={() => text.trim() && onSave(text.trim())}
            disabled={!text.trim()}
            className="text-sm px-3.5 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40"
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
        <div className="text-xs text-slate-500">
          Opens your default email app addressed to <span className="font-medium">{recipientEmail}</span>, and logs it here once sent.
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500">Subject</label>
          <input
            autoFocus
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full mt-1 px-2.5 py-1.5 text-sm rounded-md border border-slate-200 outline-none focus:border-slate-400"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500">Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            className="w-full mt-1 px-2.5 py-1.5 text-sm rounded-md border border-slate-200 outline-none focus:border-slate-400 resize-none"
          />
        </div>
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-md text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={!subject.trim() && !body.trim()}
            className="flex items-center gap-1.5 text-sm px-3.5 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40"
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
    <div className="fixed inset-0 bg-slate-900/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
