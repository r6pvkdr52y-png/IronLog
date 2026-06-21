import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Plus, X, ChevronLeft, ChevronRight, Play, Pause, RotateCcw, Settings, Home, BarChart3, Check, Maximize2, Minimize2, Download, Upload, Trash2, Edit2, ChevronDown, Flame, TrendingUp } from "lucide-react";

// ---------- Utilities ----------

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const epley1RM = (weight, reps) => {
  if (!weight || !reps) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
};

const fmtNum = (n, decimals = 1) => {
  if (n === null || n === undefined || isNaN(n)) return "—";
  const rounded = Math.round(n * Math.pow(10, decimals)) / Math.pow(10, decimals);
  return rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(decimals);
};

const fmtDate = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const fmtDuration = (sec) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const kgToLb = (kg) => kg * 2.20462;
const lbToKg = (lb) => lb / 2.20462;

// ---------- Storage ----------

const STORAGE_KEY = "ironlog-data-v1";

const defaultData = () => ({
  exercises: {}, // id -> { id, name, repRangeLow, repRangeHigh, restSeconds, history: [{workoutId, date, sets:[{weight,reps}]}] }
  templates: {}, // id -> { id, name, exerciseIds: [] }
  workouts: {}, // id -> { id, date, startedAt, finishedAt, name, entries: [{exerciseId, sets:[{weight,reps,completed}]}] }
  settings: { unit: "kg" },
});

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    const parsed = JSON.parse(raw);
    return { ...defaultData(), ...parsed };
  } catch {
    return defaultData();
  }
}

function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("Save failed", e);
  }
}

// ---------- Seed data (first run only, so the app isn't empty) ----------

function seedIfEmpty(data) {
  if (Object.keys(data.exercises).length > 0) return data;
  const benchId = uid();
  const squatId = uid();
  const deadliftId = uid();
  const now = Date.now();
  const mkHistory = (base, weeks) =>
    weeks.map((w, i) => ({
      workoutId: uid(),
      date: new Date(now - (weeks.length - i) * 7 * 86400000).toISOString(),
      sets: w.map((r) => ({ weight: r[0], reps: r[1] })),
    }));

  data.exercises[benchId] = {
    id: benchId,
    name: "Bench Press",
    repRangeLow: 6,
    repRangeHigh: 10,
    restSeconds: 120,
    history: mkHistory(benchId, [
      [[60, 8], [60, 8], [60, 7]],
      [[62.5, 8], [62.5, 7], [60, 8]],
      [[62.5, 8], [62.5, 8], [62.5, 7]],
      [[65, 7], [62.5, 8], [62.5, 8]],
    ]),
  };
  data.exercises[squatId] = {
    id: squatId,
    name: "Back Squat",
    repRangeLow: 5,
    repRangeHigh: 8,
    restSeconds: 150,
    history: mkHistory(squatId, [
      [[80, 6], [80, 6], [80, 5]],
      [[82.5, 6], [82.5, 5], [80, 6]],
      [[85, 5], [82.5, 6], [82.5, 6]],
    ]),
  };
  data.exercises[deadliftId] = {
    id: deadliftId,
    name: "Deadlift",
    repRangeLow: 4,
    repRangeHigh: 6,
    restSeconds: 180,
    history: mkHistory(deadliftId, [
      [[100, 5], [100, 5]],
      [[105, 5], [100, 5]],
      [[105, 5], [105, 4]],
    ]),
  };
  const tmplId = uid();
  data.templates[tmplId] = {
    id: tmplId,
    name: "Push / Pull / Legs A",
    exerciseIds: [benchId, squatId, deadliftId],
  };
  return data;
}

// ---------- Root App ----------

export default function App() {
  const [data, setData] = useState(() => seedIfEmpty(loadData()));
  const [tab, setTab] = useState("home"); // home, library, graphs, settings
  const [activeWorkout, setActiveWorkout] = useState(null); // workout object in progress
  const [finishedSummary, setFinishedSummary] = useState(null);
  const [editingTemplate, setEditingTemplate] = useState(null); // template id being edited, or 'new'
  const [viewingExercise, setViewingExercise] = useState(null); // exercise id for graph detail
  const [floatingTimer, setFloatingTimer] = useState(null); // {endTime, exerciseId, label, totalSeconds}
  const audioCtxRef = useRef(null);

  useEffect(() => {
    saveData(data);
  }, [data]);

  // ---- Timer alarm system ----
  const playAlarm = useCallback(() => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const now = ctx.currentTime;
      [0, 0.35, 0.7].forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.3, now + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.32);
      });
    } catch (e) {
      console.error("Audio failed", e);
    }
    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200, 100, 400]);
    }
    if (typeof window !== "undefined" && "Notification" in window && window.Notification.permission === "granted") {
      try {
        new window.Notification("Rest complete", { body: "Time for your next set.", silent: false });
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && window.Notification.permission === "default") {
      window.Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!floatingTimer) return;
    const id = setInterval(() => {
      setFloatingTimer((ft) => {
        if (!ft) return ft;
        const remaining = Math.ceil((ft.endTime - Date.now()) / 1000);
        if (remaining <= 0) {
          playAlarm();
          return null;
        }
        return ft;
      });
    }, 250);
    return () => clearInterval(id);
  }, [floatingTimer, playAlarm]);

  // ---- Data mutation helpers ----
  const updateExercise = (id, patch) => {
    setData((d) => ({ ...d, exercises: { ...d.exercises, [id]: { ...d.exercises[id], ...patch } } }));
  };

  const createExercise = (name, repRangeLow = 6, repRangeHigh = 10, restSeconds = 90) => {
    const id = uid();
    setData((d) => ({
      ...d,
      exercises: {
        ...d.exercises,
        [id]: { id, name, repRangeLow, repRangeHigh, restSeconds, history: [] },
      },
    }));
    return id;
  };

  const deleteExercise = (id) => {
    setData((d) => {
      const ex = { ...d.exercises };
      delete ex[id];
      const tmpls = {};
      Object.values(d.templates).forEach((t) => {
        tmpls[t.id] = { ...t, exerciseIds: t.exerciseIds.filter((eid) => eid !== id) };
      });
      return { ...d, exercises: ex, templates: tmpls };
    });
  };

  const saveTemplate = (template) => {
    setData((d) => ({ ...d, templates: { ...d.templates, [template.id]: template } }));
  };

  const deleteTemplate = (id) => {
    setData((d) => {
      const t = { ...d.templates };
      delete t[id];
      return { ...d, templates: t };
    });
  };

  const startWorkoutFromTemplate = (template) => {
    setActiveWorkout({
      id: uid(),
      name: template ? template.name : "Empty Workout",
      fromTemplateId: template ? template.id : null,
      startedAt: Date.now(),
      entries: (template ? template.exerciseIds : []).map((exerciseId) => ({
        exerciseId,
        sets: [{ weight: "", reps: "", completed: false }],
      })),
      focusMode: false,
    });
  };

  const finishWorkout = (workout) => {
    // Compute PRs before merging into history
    const prResults = []; // {exerciseId, exerciseName, setIndex, weightPR, oneRmPR}
    const newExercises = { ...data.exercises };

    workout.entries.forEach((entry) => {
      const ex = newExercises[entry.exerciseId];
      if (!ex) return;
      const completedSets = entry.sets.filter((s) => s.completed && s.weight !== "" && s.reps !== "");
      if (completedSets.length === 0) return;

      const priorBestWeight = Math.max(0, ...ex.history.flatMap((h) => h.sets.map((s) => s.weight)));
      const priorBest1RM = Math.max(0, ...ex.history.flatMap((h) => h.sets.map((s) => epley1RM(s.weight, s.reps))));

      completedSets.forEach((s) => {
        const w = parseFloat(s.weight);
        const r = parseInt(s.reps);
        const oneRm = epley1RM(w, r);
        const weightPR = w >= priorBestWeight && w > 0 && priorBestWeight > 0 ? w > priorBestWeight : w > 0 && priorBestWeight === 0 ? false : w > priorBestWeight;
        const oneRmPR = oneRm > priorBest1RM && priorBest1RM > 0;
        if (weightPR || oneRmPR) {
          prResults.push({ exerciseId: entry.exerciseId, exerciseName: ex.name, weight: w, reps: r, weightPR, oneRmPR });
        }
      });

      newExercises[entry.exerciseId] = {
        ...ex,
        history: [
          ...ex.history,
          {
            workoutId: workout.id,
            date: new Date().toISOString(),
            sets: completedSets.map((s) => ({ weight: parseFloat(s.weight), reps: parseInt(s.reps) })),
          },
        ],
      };
    });

    const finishedAt = Date.now();
    const savedWorkout = {
      id: workout.id,
      name: workout.name,
      date: new Date().toISOString(),
      startedAt: workout.startedAt,
      finishedAt,
      entries: workout.entries.map((e) => ({
        exerciseId: e.exerciseId,
        sets: e.sets.filter((s) => s.completed && s.weight !== "" && s.reps !== ""),
      })),
    };

    setData((d) => ({
      ...d,
      exercises: newExercises,
      workouts: { ...d.workouts, [workout.id]: savedWorkout },
    }));

    setFloatingTimer(null);
    setActiveWorkout(null);
    setFinishedSummary({
      workout: savedWorkout,
      prResults,
      durationSec: Math.round((finishedAt - workout.startedAt) / 1000),
      offeredTemplateSave: !workout.fromTemplateId,
    });
  };

  const setUnit = (unit) => setData((d) => ({ ...d, settings: { ...d.settings, unit } }));

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ironlog-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importData = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        setData({ ...defaultData(), ...parsed });
      } catch (err) {
        alert("Couldn't read that file — make sure it's an IronLog export.");
      }
    };
    reader.readAsText(file);
  };

  const clearAllData = () => {
    setData(defaultData());
  };

  // ---- Render ----

  if (activeWorkout) {
    return (
      <ActiveWorkoutScreen
        workout={activeWorkout}
        setWorkout={setActiveWorkout}
        exercises={data.exercises}
        unit={data.settings.unit}
        updateExercise={updateExercise}
        createExercise={createExercise}
        onFinish={finishWorkout}
        onCancel={() => {
          if (confirm("Discard this workout? Nothing will be saved.")) {
            setFloatingTimer(null);
            setActiveWorkout(null);
          }
        }}
        floatingTimer={floatingTimer}
        setFloatingTimer={setFloatingTimer}
        playAlarm={playAlarm}
      />
    );
  }

  return (
    <div className="app-shell">
      <style>{GLOBAL_CSS}</style>
      <div className="app-content">
        {finishedSummary && (
          <FinishSummaryModal
            summary={finishedSummary}
            exercises={data.exercises}
            unit={data.settings.unit}
            onClose={() => setFinishedSummary(null)}
            onSaveAsTemplate={(name) => {
              const tmplId = uid();
              saveTemplate({
                id: tmplId,
                name,
                exerciseIds: finishedSummary.workout.entries.map((e) => e.exerciseId),
              });
              setFinishedSummary(null);
            }}
          />
        )}

        {editingTemplate && (
          <TemplateEditorModal
            template={editingTemplate === "new" ? { id: uid(), name: "", exerciseIds: [] } : data.templates[editingTemplate]}
            exercises={data.exercises}
            createExercise={createExercise}
            onSave={(t) => {
              saveTemplate(t);
              setEditingTemplate(null);
            }}
            onDelete={(id) => {
              deleteTemplate(id);
              setEditingTemplate(null);
            }}
            onClose={() => setEditingTemplate(null)}
          />
        )}

        {viewingExercise && (
          <ExerciseDetailModal
            exercise={data.exercises[viewingExercise]}
            unit={data.settings.unit}
            onUpdate={(patch) => updateExercise(viewingExercise, patch)}
            onDelete={() => {
              deleteExercise(viewingExercise);
              setViewingExercise(null);
            }}
            onClose={() => setViewingExercise(null)}
          />
        )}

        {tab === "home" && (
          <HomeScreen
            templates={data.templates}
            exercises={data.exercises}
            onStartTemplate={startWorkoutFromTemplate}
            onStartEmpty={() => startWorkoutFromTemplate(null)}
            onEditTemplate={(id) => setEditingTemplate(id)}
            onNewTemplate={() => setEditingTemplate("new")}
          />
        )}
        {tab === "library" && (
          <LibraryScreen
            exercises={data.exercises}
            onSelect={(id) => setViewingExercise(id)}
            createExercise={createExercise}
          />
        )}
        {tab === "graphs" && (
          <GraphsScreen exercises={data.exercises} unit={data.settings.unit} onSelect={(id) => setViewingExercise(id)} />
        )}
        {tab === "settings" && (
          <SettingsScreen
            unit={data.settings.unit}
            setUnit={setUnit}
            onExport={exportData}
            onImport={importData}
            onClearAll={clearAllData}
            workoutCount={Object.keys(data.workouts).length}
            exerciseCount={Object.keys(data.exercises).length}
          />
        )}
      </div>

      <nav className="tab-bar">
        <TabButton icon={Home} label="Home" active={tab === "home"} onClick={() => setTab("home")} />
        <TabButton icon={Flame} label="Library" active={tab === "library"} onClick={() => setTab("library")} />
        <TabButton icon={BarChart3} label="Graphs" active={tab === "graphs"} onClick={() => setTab("graphs")} />
        <TabButton icon={Settings} label="Settings" active={tab === "settings"} onClick={() => setTab("settings")} />
      </nav>
    </div>
  );
}

function TabButton({ icon: Icon, label, active, onClick }) {
  return (
    <button className={`tab-btn ${active ? "tab-btn-active" : ""}`} onClick={onClick}>
      <Icon size={20} strokeWidth={active ? 2.5 : 2} />
      <span>{label}</span>
    </button>
  );
}

// ---------- Home Screen ----------

function HomeScreen({ templates, exercises, onStartTemplate, onStartEmpty, onEditTemplate, onNewTemplate }) {
  const templateList = Object.values(templates);
  return (
    <div className="screen">
      <header className="screen-header">
        <div className="eyebrow">IronLog</div>
        <h1>Today's session</h1>
      </header>

      <button className="empty-start-btn" onClick={onStartEmpty}>
        <Plus size={22} strokeWidth={2.5} />
        <div>
          <div className="empty-start-title">Start empty workout</div>
          <div className="empty-start-sub">Add exercises as you go</div>
        </div>
      </button>

      <div className="section-row">
        <h2>Templates</h2>
        <button className="link-btn" onClick={onNewTemplate}>
          <Plus size={16} /> New
        </button>
      </div>

      {templateList.length === 0 && (
        <div className="empty-state">
          No templates yet. Finish a workout and save it as one, or build one from scratch.
        </div>
      )}

      <div className="template-list">
        {templateList.map((t) => (
          <div key={t.id} className="template-card">
            <div className="template-card-main" onClick={() => onStartTemplate(t)}>
              <div className="template-card-title">{t.name || "Untitled template"}</div>
              <div className="template-card-sub">
                {t.exerciseIds.length === 0
                  ? "No exercises yet"
                  : t.exerciseIds.map((id) => exercises[id]?.name).filter(Boolean).join(" · ")}
              </div>
            </div>
            <button className="icon-btn-ghost" onClick={() => onEditTemplate(t.id)}>
              <Edit2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Library Screen ----------

function LibraryScreen({ exercises, onSelect, createExercise }) {
  const [query, setQuery] = useState("");
  const list = Object.values(exercises)
    .filter((e) => e.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  const handleAdd = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const id = createExercise(trimmed);
    setQuery("");
    onSelect(id);
  };

  const exactMatch = list.some((e) => e.name.toLowerCase() === query.trim().toLowerCase());

  return (
    <div className="screen">
      <header className="screen-header">
        <div className="eyebrow">Library</div>
        <h1>Exercises</h1>
      </header>

      <div className="search-row">
        <input
          className="text-input"
          placeholder="Search or add an exercise…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && query.trim() && !exactMatch) handleAdd();
          }}
        />
        {query.trim() && !exactMatch && (
          <button className="add-inline-btn" onClick={handleAdd}>
            <Plus size={18} />
          </button>
        )}
      </div>

      {list.length === 0 && (
        <div className="empty-state">
          {query.trim() ? `No matches. Tap + to add "${query.trim()}".` : "No exercises yet — type a name above to add your first one."}
        </div>
      )}

      <div className="exercise-list">
        {list.map((ex) => {
          const lastSession = ex.history[ex.history.length - 1];
          return (
            <div key={ex.id} className="exercise-row" onClick={() => onSelect(ex.id)}>
              <div>
                <div className="exercise-row-name">{ex.name}</div>
                <div className="exercise-row-meta">
                  {ex.repRangeLow}–{ex.repRangeHigh} reps · {ex.history.length} session{ex.history.length === 1 ? "" : "s"}
                </div>
              </div>
              {lastSession && (
                <div className="exercise-row-last">
                  {fmtNum(lastSession.sets[lastSession.sets.length - 1]?.weight)}kg × {lastSession.sets[lastSession.sets.length - 1]?.reps}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Exercise Detail Modal (edit rep range/rest, view mini history) ----------

function ExerciseDetailModal({ exercise, unit, onUpdate, onDelete, onClose }) {
  const [name, setName] = useState(exercise.name);
  const [low, setLow] = useState(exercise.repRangeLow);
  const [high, setHigh] = useState(exercise.repRangeHigh);
  const [rest, setRest] = useState(exercise.restSeconds);

  const commit = () => {
    onUpdate({
      name: name.trim() || exercise.name,
      repRangeLow: parseInt(low) || exercise.repRangeLow,
      repRangeHigh: parseInt(high) || exercise.repRangeHigh,
      restSeconds: parseInt(rest) || exercise.restSeconds,
    });
  };

  const recentHistory = [...exercise.history].reverse().slice(0, 6);

  return (
    <Modal onClose={() => { commit(); onClose(); }} title="Exercise">
      <div className="field-group">
        <label className="field-label">Name</label>
        <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} onBlur={commit} />
      </div>
      <div className="field-row">
        <div className="field-group">
          <label className="field-label">Rep range low</label>
          <input className="text-input" type="number" value={low} onChange={(e) => setLow(e.target.value)} onBlur={commit} />
        </div>
        <div className="field-group">
          <label className="field-label">Rep range high</label>
          <input className="text-input" type="number" value={high} onChange={(e) => setHigh(e.target.value)} onBlur={commit} />
        </div>
      </div>
      <div className="field-group">
        <label className="field-label">Default rest (seconds)</label>
        <input className="text-input" type="number" value={rest} onChange={(e) => setRest(e.target.value)} onBlur={commit} />
      </div>

      {recentHistory.length > 0 && (
        <div className="field-group">
          <label className="field-label">Recent sessions</label>
          <div className="mini-history">
            {recentHistory.map((h, i) => (
              <div className="mini-history-row" key={i}>
                <span className="mini-history-date">{fmtDate(h.date)}</span>
                <span className="mini-history-sets">
                  {h.sets.map((s, j) => `${fmtNum(s.weight)}×${s.reps}`).join(", ")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button className="danger-btn" onClick={() => { if (confirm(`Delete "${exercise.name}"? This removes all its history.`)) onDelete(); }}>
        <Trash2 size={16} /> Delete exercise
      </button>
    </Modal>
  );
}

// ---------- Template Editor Modal ----------

function TemplateEditorModal({ template, exercises, createExercise, onSave, onDelete, onClose }) {
  const [name, setName] = useState(template.name);
  const [exerciseIds, setExerciseIds] = useState(template.exerciseIds);
  const [query, setQuery] = useState("");
  const [showPicker, setShowPicker] = useState(false);

  const available = Object.values(exercises)
    .filter((e) => !exerciseIds.includes(e.id))
    .filter((e) => e.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  const exactMatch = available.some((e) => e.name.toLowerCase() === query.trim().toLowerCase()) ||
    exerciseIds.some((id) => exercises[id]?.name.toLowerCase() === query.trim().toLowerCase());

  const addExisting = (id) => {
    setExerciseIds((ids) => [...ids, id]);
    setQuery("");
  };

  const addNew = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const id = createExercise(trimmed);
    setExerciseIds((ids) => [...ids, id]);
    setQuery("");
  };

  const removeExercise = (id) => setExerciseIds((ids) => ids.filter((x) => x !== id));

  const move = (index, dir) => {
    setExerciseIds((ids) => {
      const next = [...ids];
      const target = index + dir;
      if (target < 0 || target >= next.length) return next;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleSave = () => {
    if (!name.trim()) {
      alert("Give your template a name first.");
      return;
    }
    onSave({ ...template, name: name.trim(), exerciseIds });
  };

  return (
    <Modal onClose={onClose} title={template.name ? "Edit template" : "New template"}>
      <div className="field-group">
        <label className="field-label">Template name</label>
        <input className="text-input" placeholder="e.g. Push Day" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>

      <div className="field-group">
        <label className="field-label">Exercises</label>
        {exerciseIds.length === 0 && <div className="empty-state-small">No exercises added yet.</div>}
        <div className="template-exercise-list">
          {exerciseIds.map((id, i) => (
            <div className="template-exercise-row" key={id}>
              <div className="reorder-col">
                <button className="reorder-btn" disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
                <button className="reorder-btn" disabled={i === exerciseIds.length - 1} onClick={() => move(i, 1)}>▼</button>
              </div>
              <div className="template-exercise-name">{exercises[id]?.name}</div>
              <button className="icon-btn-ghost" onClick={() => removeExercise(id)}>
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="field-group">
        <label className="field-label">Add exercise</label>
        <input
          className="text-input"
          placeholder="Search library or type new…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && query.trim() && !exactMatch) addNew();
          }}
        />
        {query.trim() && (
          <div className="picker-list">
            {available.slice(0, 6).map((e) => (
              <button key={e.id} className="picker-item" onClick={() => addExisting(e.id)}>
                {e.name}
              </button>
            ))}
            {!exactMatch && (
              <button className="picker-item picker-item-new" onClick={addNew}>
                <Plus size={14} /> Add "{query.trim()}" as new exercise
              </button>
            )}
          </div>
        )}
      </div>

      <button className="primary-btn" onClick={handleSave}>Save template</button>
      {template.name && (
        <button className="danger-btn" onClick={() => { if (confirm("Delete this template?")) onDelete(template.id); }}>
          <Trash2 size={16} /> Delete template
        </button>
      )}
    </Modal>
  );
}

// ---------- Graphs Screen ----------

function GraphsScreen({ exercises, unit, onSelect }) {
  const list = Object.values(exercises)
    .filter((e) => e.history.length > 0)
    .sort((a, b) => b.history.length - a.history.length);

  return (
    <div className="screen">
      <header className="screen-header">
        <div className="eyebrow">Progress</div>
        <h1>Graphs</h1>
      </header>

      {list.length === 0 && (
        <div className="empty-state">Log a few workouts and your progress graphs will show up here.</div>
      )}

      <div className="graph-card-list">
        {list.map((ex) => (
          <ExerciseGraphCard key={ex.id} exercise={ex} onClick={() => onSelect(ex.id)} />
        ))}
      </div>
    </div>
  );
}

function computePlateauFlag(history, n = 4) {
  if (history.length < n + 1) return false;
  const recent = history.slice(-n);
  const before = history.slice(0, -n);
  const bestBefore = Math.max(...before.flatMap((h) => h.sets.map((s) => epley1RM(s.weight, s.reps))), 0);
  const bestRecent = Math.max(...recent.flatMap((h) => h.sets.map((s) => epley1RM(s.weight, s.reps))), 0);
  return bestRecent <= bestBefore;
}

function ExerciseGraphCard({ exercise, onClick }) {
  const plateaued = computePlateauFlag(exercise.history);
  const chartData = exercise.history.map((h) => ({
    date: fmtDate(h.date),
    oneRm: Math.max(...h.sets.map((s) => epley1RM(s.weight, s.reps))),
  }));
  const latest = chartData[chartData.length - 1]?.oneRm;

  return (
    <div className="graph-card" onClick={onClick}>
      <div className="graph-card-header">
        <div>
          <div className="graph-card-title">{exercise.name}</div>
          <div className="graph-card-sub">Est. 1RM {fmtNum(latest)}kg</div>
        </div>
        {plateaued && (
          <div className="plateau-badge" title="No improvement in recent sessions">
            <TrendingUp size={12} />
          </div>
        )}
      </div>
      <div className="graph-card-chart">
        <ResponsiveContainer width="100%" height={70}>
          <LineChart data={chartData}>
            <Line type="monotone" dataKey="oneRm" stroke="#FF6B35" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---------- Settings Screen ----------

function SettingsScreen({ unit, setUnit, onExport, onImport, onClearAll, workoutCount, exerciseCount }) {
  const fileRef = useRef(null);
  return (
    <div className="screen">
      <header className="screen-header">
        <div className="eyebrow">Settings</div>
        <h1>Preferences & data</h1>
      </header>

      <div className="settings-section">
        <div className="settings-label">Units</div>
        <div className="segmented">
          <button className={unit === "kg" ? "segmented-active" : ""} onClick={() => setUnit("kg")}>kg</button>
          <button className={unit === "lb" ? "segmented-active" : ""} onClick={() => setUnit("lb")}>lb</button>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-label">Your data</div>
        <div className="settings-stat">{exerciseCount} exercises · {workoutCount} workouts logged</div>
        <button className="secondary-btn" onClick={onExport}>
          <Download size={16} /> Export backup (.json)
        </button>
        <button className="secondary-btn" onClick={() => fileRef.current?.click()}>
          <Upload size={16} /> Import backup
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files?.[0]) onImport(e.target.files[0]);
            e.target.value = "";
          }}
        />
      </div>

      <div className="settings-section">
        <button
          className="danger-btn"
          onClick={() => {
            if (confirm("This deletes everything — exercises, templates, and history. Export a backup first if you're not sure. Continue?")) {
              onClearAll();
            }
          }}
        >
          <Trash2 size={16} /> Clear all data
        </button>
      </div>
    </div>
  );
}

// ---------- Active Workout Screen ----------

function ActiveWorkoutScreen({ workout, setWorkout, exercises, unit, updateExercise, createExercise, onFinish, onCancel, floatingTimer, setFloatingTimer, playAlarm }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.round((Date.now() - workout.startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [workout.startedAt]);

  const startTimer = (exerciseId, seconds) => {
    setFloatingTimer({
      endTime: Date.now() + seconds * 1000,
      exerciseId,
      label: exercises[exerciseId]?.name || "Rest",
      totalSeconds: seconds,
    });
  };

  const addSet = (entryIndex) => {
    setWorkout((w) => {
      const entries = [...w.entries];
      const lastSet = entries[entryIndex].sets[entries[entryIndex].sets.length - 1];
      entries[entryIndex] = {
        ...entries[entryIndex],
        sets: [...entries[entryIndex].sets, { weight: lastSet?.weight || "", reps: lastSet?.reps || "", completed: false }],
      };
      return { ...w, entries };
    });
  };

  const updateSet = (entryIndex, setIndex, patch) => {
    setWorkout((w) => {
      const entries = [...w.entries];
      const sets = [...entries[entryIndex].sets];
      sets[setIndex] = { ...sets[setIndex], ...patch };
      entries[entryIndex] = { ...entries[entryIndex], sets };
      return { ...w, entries };
    });
  };

  const completeSet = (entryIndex, setIndex) => {
    const entry = workout.entries[entryIndex];
    const set = entry.sets[setIndex];
    if (set.weight === "" || set.reps === "") return;
    updateSet(entryIndex, setIndex, { completed: true });
    const ex = exercises[entry.exerciseId];
    if (ex) startTimer(entry.exerciseId, ex.restSeconds);
  };

  const removeSet = (entryIndex, setIndex) => {
    setWorkout((w) => {
      const entries = [...w.entries];
      entries[entryIndex] = { ...entries[entryIndex], sets: entries[entryIndex].sets.filter((_, i) => i !== setIndex) };
      return { ...w, entries };
    });
  };

  const addExerciseToWorkout = (exerciseId) => {
    setWorkout((w) => ({
      ...w,
      entries: [...w.entries, { exerciseId, sets: [{ weight: "", reps: "", completed: false }] }],
    }));
    setPickerOpen(false);
  };

  const removeExerciseFromWorkout = (entryIndex) => {
    setWorkout((w) => ({ ...w, entries: w.entries.filter((_, i) => i !== entryIndex) }));
  };

  const handleFinish = () => {
    const anyCompleted = workout.entries.some((e) => e.sets.some((s) => s.completed));
    if (!anyCompleted) {
      if (!confirm("No sets logged yet. Finish anyway?")) return;
    }
    onFinish(workout);
  };

  const toggleFocusMode = () => setWorkout((w) => ({ ...w, focusMode: !w.focusMode }));

  return (
    <div className="app-shell">
      <style>{GLOBAL_CSS}</style>

      {floatingTimer && (
        <FloatingTimerPill timer={floatingTimer} onCancel={() => setFloatingTimer(null)} />
      )}

      <div className="workout-topbar">
        <button className="icon-btn-ghost" onClick={onCancel}>
          <X size={20} />
        </button>
        <div className="workout-topbar-center">
          <div className="workout-topbar-title">{workout.name}</div>
          <div className="workout-topbar-timer">{fmtDuration(elapsed)}</div>
        </div>
        <button className="icon-btn-ghost" onClick={toggleFocusMode} title="Toggle focus mode">
          {workout.focusMode ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      </div>

      <div className="app-content workout-content">
        {workout.focusMode ? (
          <FocusModeView
            workout={workout}
            exercises={exercises}
            completeSet={completeSet}
            updateSet={updateSet}
            addSet={addSet}
          />
        ) : (
          <ListModeView
            workout={workout}
            exercises={exercises}
            unit={unit}
            updateSet={updateSet}
            completeSet={completeSet}
            addSet={addSet}
            removeSet={removeSet}
            removeExerciseFromWorkout={removeExerciseFromWorkout}
            startTimer={startTimer}
          />
        )}

        {!workout.focusMode && (
          <>
            <button className="add-exercise-btn" onClick={() => setPickerOpen(true)}>
              <Plus size={18} /> Add exercise
            </button>
          </>
        )}

        <button className="primary-btn finish-btn" onClick={handleFinish}>
          Finish workout
        </button>
      </div>

      {pickerOpen && (
        <ExercisePickerModal
          exercises={exercises}
          createExercise={createExercise}
          onPick={addExerciseToWorkout}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

function ExercisePickerModal({ exercises, createExercise, onPick, onClose }) {
  const [query, setQuery] = useState("");
  const list = Object.values(exercises)
    .filter((e) => e.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  const exactMatch = list.some((e) => e.name.toLowerCase() === query.trim().toLowerCase());

  const handleAddNew = () => {
    const id = createExercise(query.trim());
    onPick(id);
  };

  return (
    <Modal onClose={onClose} title="Add exercise">
      <input
        className="text-input"
        placeholder="Search or type new exercise…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter" && query.trim() && !exactMatch) handleAddNew();
        }}
      />
      <div className="picker-list picker-list-tall">
        {list.map((e) => (
          <button key={e.id} className="picker-item" onClick={() => onPick(e.id)}>
            {e.name}
          </button>
        ))}
        {query.trim() && !exactMatch && (
          <button className="picker-item picker-item-new" onClick={handleAddNew}>
            <Plus size={14} /> Add "{query.trim()}" as new exercise
          </button>
        )}
      </div>
    </Modal>
  );
}

// ---------- List Mode ----------

function ListModeView({ workout, exercises, unit, updateSet, completeSet, addSet, removeSet, removeExerciseFromWorkout, startTimer }) {
  return (
    <div className="list-mode">
      {workout.entries.map((entry, entryIndex) => {
        const ex = exercises[entry.exerciseId];
        if (!ex) return null;
        const lastSession = ex.history[ex.history.length - 1];
        return (
          <div className="exercise-block" key={entryIndex}>
            <div className="exercise-block-header">
              <div>
                <div className="exercise-block-title">{ex.name}</div>
                <div className="exercise-block-sub">
                  Target {ex.repRangeLow}–{ex.repRangeHigh} reps
                  {lastSession && (
                    <> · Last: {lastSession.sets.map((s) => `${fmtNum(s.weight)}×${s.reps}`).join(", ")}</>
                  )}
                </div>
              </div>
              <button className="icon-btn-ghost" onClick={() => removeExerciseFromWorkout(entryIndex)}>
                <X size={16} />
              </button>
            </div>

            <div className="set-table">
              <div className="set-table-head">
                <span>Set</span>
                <span>{unit}</span>
                <span>Reps</span>
                <span></span>
              </div>
              {entry.sets.map((set, setIndex) => (
                <div className={`set-row ${set.completed ? "set-row-done" : ""}`} key={setIndex}>
                  <span className="set-number">{setIndex + 1}</span>
                  <input
                    className="set-input"
                    type="number"
                    inputMode="decimal"
                    placeholder="0"
                    value={set.weight}
                    onChange={(e) => updateSet(entryIndex, setIndex, { weight: e.target.value })}
                    disabled={set.completed}
                  />
                  <input
                    className="set-input"
                    type="number"
                    inputMode="numeric"
                    placeholder="0"
                    value={set.reps}
                    onChange={(e) => updateSet(entryIndex, setIndex, { reps: e.target.value })}
                    disabled={set.completed}
                  />
                  {set.completed ? (
                    <button className="set-check set-check-done" onClick={() => updateSet(entryIndex, setIndex, { completed: false })}>
                      <Check size={16} />
                    </button>
                  ) : (
                    <button className="set-check" onClick={() => completeSet(entryIndex, setIndex)}>
                      <Check size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="exercise-block-actions">
              <button className="link-btn" onClick={() => addSet(entryIndex)}>
                <Plus size={14} /> Add set
              </button>
              <button className="link-btn" onClick={() => startTimer(entry.exerciseId, ex.restSeconds)}>
                Start rest timer ({ex.restSeconds}s)
              </button>
            </div>
          </div>
        );
      })}
      {workout.entries.length === 0 && (
        <div className="empty-state">No exercises yet — tap "Add exercise" below to get started.</div>
      )}
    </div>
  );
}

// ---------- Focus Mode ----------

function FocusModeView({ workout, exercises, completeSet, updateSet, addSet }) {
  const [entryIndex, setEntryIndex] = useState(0);
  const [setIndex, setSetIndex] = useState(0);

  const entry = workout.entries[entryIndex];
  const ex = entry ? exercises[entry.exerciseId] : null;

  useEffect(() => {
    // Clamp indices if workout changes
    if (entryIndex >= workout.entries.length) setEntryIndex(Math.max(0, workout.entries.length - 1));
  }, [workout.entries.length, entryIndex]);

  if (!entry || !ex) {
    return <div className="empty-state">Add exercises in list mode first, then switch to focus mode.</div>;
  }

  const set = entry.sets[setIndex] || entry.sets[entry.sets.length - 1];
  const lastSession = ex.history[ex.history.length - 1];
  const lastSetData = lastSession?.sets[setIndex];

  const goNextSet = () => {
    if (setIndex < entry.sets.length - 1) {
      setSetIndex(setIndex + 1);
    } else {
      // move to next exercise
      if (entryIndex < workout.entries.length - 1) {
        setEntryIndex(entryIndex + 1);
        setSetIndex(0);
      }
    }
  };

  const handleComplete = () => {
    completeSet(entryIndex, setIndex);
    setTimeout(goNextSet, 150);
  };

  const isLastSetOfExercise = setIndex === entry.sets.length - 1;
  const isLastExercise = entryIndex === workout.entries.length - 1;

  return (
    <div className="focus-mode">
      <div className="focus-progress">
        Exercise {entryIndex + 1} of {workout.entries.length}
      </div>
      <div className="focus-exercise-name">{ex.name}</div>
      <div className="focus-target">Target {ex.repRangeLow}–{ex.repRangeHigh} reps</div>

      <div className="focus-set-label">SET {setIndex + 1}{entry.sets.length > 1 ? ` / ${entry.sets.length}` : ""}</div>

      {lastSetData && (
        <div className="focus-last-time">Last time: {fmtNum(lastSetData.weight)}kg × {lastSetData.reps}</div>
      )}

      <div className="focus-input-row">
        <div className="focus-input-group">
          <label>Weight (kg)</label>
          <input
            className="focus-input"
            type="number"
            inputMode="decimal"
            placeholder="0"
            value={set.weight}
            onChange={(e) => updateSet(entryIndex, setIndex, { weight: e.target.value })}
          />
        </div>
        <div className="focus-input-group">
          <label>Reps</label>
          <input
            className="focus-input"
            type="number"
            inputMode="numeric"
            placeholder="0"
            value={set.reps}
            onChange={(e) => updateSet(entryIndex, setIndex, { reps: e.target.value })}
          />
        </div>
      </div>

      <button className="focus-complete-btn" onClick={handleComplete}>
        <Check size={24} /> Complete set
      </button>

      {isLastSetOfExercise && (
        <button className="link-btn focus-add-set" onClick={() => addSet(entryIndex)}>
          <Plus size={14} /> Add another set
        </button>
      )}

      <div className="focus-nav">
        <button
          className="focus-nav-btn"
          disabled={entryIndex === 0 && setIndex === 0}
          onClick={() => {
            if (setIndex > 0) setSetIndex(setIndex - 1);
            else if (entryIndex > 0) {
              setEntryIndex(entryIndex - 1);
              setSetIndex(exercises[workout.entries[entryIndex - 1].exerciseId] ? workout.entries[entryIndex - 1].sets.length - 1 : 0);
            }
          }}
        >
          <ChevronLeft size={18} /> Back
        </button>
        <button
          className="focus-nav-btn"
          disabled={isLastExercise && isLastSetOfExercise}
          onClick={goNextSet}
        >
          Skip <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}

// ---------- Floating Timer Pill ----------

function FloatingTimerPill({ timer, onCancel }) {
  const [remaining, setRemaining] = useState(Math.ceil((timer.endTime - Date.now()) / 1000));
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((timer.endTime - Date.now()) / 1000)));
    }, 250);
    return () => clearInterval(id);
  }, [timer.endTime]);

  const pct = Math.max(0, Math.min(1, remaining / timer.totalSeconds));

  if (remaining <= 0) return null;

  if (!expanded) {
    return (
      <button className="timer-pill-mini" onClick={() => setExpanded(true)}>
        <span className="timer-pill-mini-ring" style={{ "--pct": pct }} />
        {fmtDuration(remaining)}
      </button>
    );
  }

  return (
    <div className="timer-overlay">
      <div className="timer-overlay-label">RESTING · {timer.label}</div>
      <div className="timer-overlay-ring">
        <svg viewBox="0 0 200 200" className="timer-svg">
          <circle cx="100" cy="100" r="90" className="timer-track" />
          <circle
            cx="100"
            cy="100"
            r="90"
            className="timer-progress"
            style={{ strokeDashoffset: 2 * Math.PI * 90 * (1 - pct) }}
          />
        </svg>
        <div className="timer-overlay-number">{fmtDuration(remaining)}</div>
      </div>
      <div className="timer-overlay-actions">
        <button className="timer-action-btn" onClick={() => setExpanded(false)}>
          <Minimize2 size={16} /> Minimize
        </button>
        <button className="timer-action-btn timer-action-skip" onClick={onCancel}>
          Skip rest
        </button>
      </div>
    </div>
  );
}

// ---------- Finish Summary Modal ----------

function FinishSummaryModal({ summary, exercises, unit, onClose, onSaveAsTemplate }) {
  const [showTemplateInput, setShowTemplateInput] = useState(false);
  const [templateName, setTemplateName] = useState(summary.workout.name === "Empty Workout" ? "" : summary.workout.name);

  const totalSets = summary.workout.entries.reduce((sum, e) => sum + e.sets.length, 0);

  return (
    <Modal onClose={onClose} title="Workout saved">
      <div className="finish-hero">
        <Check size={32} strokeWidth={2.5} />
        <div className="finish-hero-stats">
          {totalSets} sets · {fmtDuration(summary.durationSec)}
        </div>
      </div>

      {summary.prResults.length > 0 && (
        <div className="pr-banner">
          <Flame size={16} />
          <div>
            {summary.prResults.length} new PR{summary.prResults.length > 1 ? "s" : ""} today
          </div>
        </div>
      )}

      <div className="finish-recap">
        {summary.workout.entries.map((entry, i) => {
          const ex = exercises[entry.exerciseId];
          const prsHere = summary.prResults.filter((p) => p.exerciseId === entry.exerciseId);
          return (
            <div className="finish-recap-row" key={i}>
              <div className="finish-recap-name">{ex?.name}</div>
              <div className="finish-recap-sets">
                {entry.sets.map((s, j) => {
                  const isPr = prsHere.some((p) => p.weight === s.weight && p.reps === s.reps);
                  return (
                    <span className={`finish-set-chip ${isPr ? "finish-set-chip-pr" : ""}`} key={j}>
                      {fmtNum(s.weight)}×{s.reps}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {summary.offeredTemplateSave && !showTemplateInput && (
        <button className="secondary-btn" onClick={() => setShowTemplateInput(true)}>
          <Plus size={16} /> Save as template
        </button>
      )}

      {showTemplateInput && (
        <div className="field-group">
          <label className="field-label">Template name</label>
          <input
            className="text-input"
            placeholder="e.g. Push Day"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            autoFocus
          />
          <button
            className="primary-btn"
            onClick={() => {
              if (templateName.trim()) onSaveAsTemplate(templateName.trim());
            }}
          >
            Save template
          </button>
        </div>
      )}

      <button className="primary-btn" onClick={onClose}>Done</button>
    </Modal>
  );
}

// ---------- Modal wrapper ----------

function Modal({ children, onClose, title }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="icon-btn-ghost" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// ---------- Global CSS ----------

const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap');

* { box-sizing: border-box; }

.app-shell {
  --bg: #121212;
  --bg-elevated: #1B1B1B;
  --bg-card: #1F1F1F;
  --border: #2D2D2D;
  --text: #F2F0EB;
  --text-dim: #9A968D;
  --text-faint: #6B675F;
  --accent: #FF6B35;
  --accent-dim: #4D2A18;
  --steel: #5B7C99;
  --success: #4CAF7D;
  font-family: 'Inter', -apple-system, sans-serif;
  background: var(--bg);
  color: var(--text);
  height: 100vh;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

.display-font { font-family: 'Barlow Condensed', sans-serif; }

.app-content {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 20px 16px 100px;
}

.workout-content { padding-top: 8px; }

.screen { max-width: 560px; margin: 0 auto; }

.screen-header { margin-bottom: 20px; }
.eyebrow {
  font-family: 'Barlow Condensed', sans-serif;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
  margin-bottom: 2px;
}
.screen-header h1 {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 34px;
  font-weight: 700;
  margin: 0;
  letter-spacing: -0.01em;
}

.tab-bar {
  display: flex;
  border-top: 1px solid var(--border);
  background: var(--bg-elevated);
  padding: 8px 8px calc(8px + env(safe-area-inset-bottom));
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
}
.tab-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  background: none;
  border: none;
  color: var(--text-faint);
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 500;
  padding: 6px 0;
  cursor: pointer;
}
.tab-btn-active { color: var(--accent); }

.empty-start-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  background: var(--accent);
  color: #1A0E06;
  border: none;
  border-radius: 14px;
  padding: 16px 18px;
  margin-bottom: 28px;
  cursor: pointer;
  text-align: left;
}
.empty-start-title { font-weight: 700; font-size: 15px; }
.empty-start-sub { font-size: 12.5px; opacity: 0.75; margin-top: 1px; }

.section-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.section-row h2 {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 20px;
  font-weight: 600;
  margin: 0;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.link-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 0;
}

.empty-state {
  color: var(--text-faint);
  font-size: 14px;
  padding: 24px 4px;
  line-height: 1.5;
}
.empty-state-small {
  color: var(--text-faint);
  font-size: 13px;
  padding: 8px 0;
}

.template-list { display: flex; flex-direction: column; gap: 10px; }
.template-card {
  display: flex;
  align-items: center;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px 16px;
}
.template-card-main { flex: 1; cursor: pointer; }
.template-card-title { font-weight: 600; font-size: 15px; margin-bottom: 2px; }
.template-card-sub { font-size: 12.5px; color: var(--text-dim); }

.icon-btn-ghost {
  background: none;
  border: none;
  color: var(--text-dim);
  padding: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.search-row { display: flex; gap: 8px; margin-bottom: 18px; }
.text-input {
  width: 100%;
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 10px;
  padding: 12px 14px;
  font-size: 15px;
  font-family: 'Inter', sans-serif;
}
.text-input:focus { outline: none; border-color: var(--accent); }
.add-inline-btn {
  background: var(--accent);
  border: none;
  color: #1A0E06;
  border-radius: 10px;
  width: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.exercise-list { display: flex; flex-direction: column; gap: 1px; }
.exercise-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-card);
  padding: 14px 16px;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
}
.exercise-row:first-child { border-radius: 12px 12px 0 0; }
.exercise-row:last-child { border-radius: 0 0 12px 12px; border-bottom: none; }
.exercise-row-name { font-weight: 600; font-size: 14.5px; }
.exercise-row-meta { font-size: 12px; color: var(--text-faint); margin-top: 2px; }
.exercise-row-last {
  font-family: 'Barlow Condensed', sans-serif;
  font-weight: 600;
  font-size: 14px;
  color: var(--steel);
}

.field-group { margin-bottom: 16px; }
.field-row { display: flex; gap: 12px; }
.field-row .field-group { flex: 1; }
.field-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-faint);
  margin-bottom: 6px;
}

.mini-history { display: flex; flex-direction: column; gap: 6px; }
.mini-history-row { display: flex; justify-content: space-between; font-size: 13px; padding: 6px 0; border-bottom: 1px solid var(--border); }
.mini-history-date { color: var(--text-faint); }
.mini-history-sets { color: var(--text-dim); }

.primary-btn {
  width: 100%;
  background: var(--accent);
  color: #1A0E06;
  border: none;
  border-radius: 12px;
  padding: 15px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  margin-top: 4px;
}
.secondary-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 12px;
  padding: 13px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  margin-bottom: 10px;
}
.danger-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: none;
  border: 1px solid #4A2A2A;
  color: #E08585;
  border-radius: 12px;
  padding: 13px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 16px;
}

.template-exercise-list { display: flex; flex-direction: column; gap: 8px; }
.template-exercise-row {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
}
.reorder-col { display: flex; flex-direction: column; gap: 0; }
.reorder-btn { background: none; border: none; color: var(--text-faint); font-size: 10px; cursor: pointer; padding: 1px 4px; }
.reorder-btn:disabled { opacity: 0.2; }
.template-exercise-name { flex: 1; font-size: 14px; font-weight: 500; }

.picker-list { display: flex; flex-direction: column; gap: 2px; margin-top: 8px; max-height: 200px; overflow-y: auto; }
.picker-list-tall { max-height: 50vh; }
.picker-item {
  text-align: left;
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 12px 14px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}
.picker-item-new { color: var(--accent); display: flex; align-items: center; gap: 6px; font-weight: 600; }

.settings-section { margin-bottom: 28px; }
.settings-label {
  font-family: 'Barlow Condensed', sans-serif;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-dim);
  margin-bottom: 10px;
}
.settings-stat { font-size: 13px; color: var(--text-faint); margin-bottom: 12px; }
.segmented {
  display: flex;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}
.segmented button {
  flex: 1;
  background: none;
  border: none;
  color: var(--text-dim);
  padding: 11px;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
}
.segmented-active { background: var(--accent) !important; color: #1A0E06 !important; }

.graph-card-list { display: flex; flex-direction: column; gap: 12px; }
.graph-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 16px;
  cursor: pointer;
}
.graph-card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; }
.graph-card-title { font-weight: 600; font-size: 15px; }
.graph-card-sub { font-size: 12px; color: var(--text-faint); margin-top: 2px; }
.plateau-badge {
  background: var(--accent-dim);
  color: var(--accent);
  border-radius: 6px;
  padding: 4px 6px;
  display: flex;
  align-items: center;
}

.workout-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-elevated);
}
.workout-topbar-center { text-align: center; }
.workout-topbar-title { font-weight: 600; font-size: 14px; }
.workout-topbar-timer {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 13px;
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}

.list-mode { display: flex; flex-direction: column; gap: 16px; max-width: 560px; margin: 0 auto 16px; }
.exercise-block {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 14px;
}
.exercise-block-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
.exercise-block-title { font-weight: 700; font-size: 16px; }
.exercise-block-sub { font-size: 12px; color: var(--text-faint); margin-top: 2px; }

.set-table { display: flex; flex-direction: column; }
.set-table-head {
  display: grid;
  grid-template-columns: 32px 1fr 1fr 40px;
  gap: 8px;
  font-size: 11px;
  color: var(--text-faint);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0 2px 6px;
}
.set-row {
  display: grid;
  grid-template-columns: 32px 1fr 1fr 40px;
  gap: 8px;
  align-items: center;
  padding: 4px 2px;
}
.set-number {
  font-family: 'Barlow Condensed', sans-serif;
  font-weight: 600;
  color: var(--text-dim);
  text-align: center;
}
.set-input {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 8px;
  padding: 9px 8px;
  font-size: 15px;
  text-align: center;
  font-family: 'Barlow Condensed', sans-serif;
  font-weight: 600;
  width: 100%;
}
.set-input:disabled { opacity: 0.6; }
.set-input:focus { outline: none; border-color: var(--accent); }
.set-check {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  color: var(--text-faint);
  border-radius: 8px;
  width: 40px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.set-check-done { background: var(--success); border-color: var(--success); color: #0E2A1B; }
.set-row-done { opacity: 0.85; }

.exercise-block-actions { display: flex; justify-content: space-between; margin-top: 10px; }

.add-exercise-btn {
  width: 100%;
  max-width: 560px;
  margin: 0 auto 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: none;
  border: 1.5px dashed var(--border);
  color: var(--text-dim);
  border-radius: 12px;
  padding: 14px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.finish-btn { max-width: 560px; margin: 8px auto 0; display: block; }

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: flex-end;
  z-index: 100;
}
.modal-sheet {
  background: var(--bg-elevated);
  width: 100%;
  max-height: 88vh;
  overflow-y: auto;
  border-radius: 18px 18px 0 0;
  padding: 8px 18px calc(24px + env(safe-area-inset-bottom));
}
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 0 16px; }
.modal-title { font-family: 'Barlow Condensed', sans-serif; font-size: 20px; font-weight: 700; }

.finish-hero { display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--success); padding: 12px 0 4px; }
.finish-hero-stats { font-size: 14px; color: var(--text-dim); font-weight: 500; }
.pr-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--accent-dim);
  color: var(--accent);
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 13.5px;
  font-weight: 600;
  margin: 12px 0;
}
.finish-recap { display: flex; flex-direction: column; gap: 10px; margin: 16px 0; }
.finish-recap-row { padding-bottom: 10px; border-bottom: 1px solid var(--border); }
.finish-recap-name { font-weight: 600; font-size: 14px; margin-bottom: 6px; }
.finish-recap-sets { display: flex; flex-wrap: wrap; gap: 6px; }
.finish-set-chip {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12.5px;
  font-family: 'Barlow Condensed', sans-serif;
  font-weight: 600;
  color: var(--text-dim);
}
.finish-set-chip-pr { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }

.focus-mode {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 24px 8px;
  max-width: 420px;
  margin: 0 auto;
}
.focus-progress { font-size: 12px; color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; }
.focus-exercise-name {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 32px;
  font-weight: 700;
  margin-bottom: 4px;
}
.focus-target { font-size: 13px; color: var(--text-dim); margin-bottom: 24px; }
.focus-set-label {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--accent);
  margin-bottom: 6px;
}
.focus-last-time { font-size: 13px; color: var(--text-faint); margin-bottom: 20px; }
.focus-input-row { display: flex; gap: 16px; margin-bottom: 28px; width: 100%; justify-content: center; }
.focus-input-group { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.focus-input-group label { font-size: 11px; color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.05em; }
.focus-input {
  background: var(--bg-card);
  border: 2px solid var(--border);
  color: var(--text);
  border-radius: 16px;
  width: 110px;
  height: 84px;
  text-align: center;
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 36px;
  font-weight: 700;
}
.focus-input:focus { outline: none; border-color: var(--accent); }
.focus-complete-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--accent);
  color: #1A0E06;
  border: none;
  border-radius: 50px;
  padding: 18px 36px;
  font-size: 17px;
  font-weight: 700;
  cursor: pointer;
  margin-bottom: 14px;
}
.focus-add-set { margin-bottom: 10px; }
.focus-nav { display: flex; gap: 16px; margin-top: 18px; width: 100%; justify-content: center; }
.focus-nav-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  color: var(--text-faint);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 8px;
}
.focus-nav-btn:disabled { opacity: 0.25; }

.timer-pill-mini {
  position: absolute;
  top: 70px;
  right: 16px;
  z-index: 90;
  background: var(--accent);
  color: #1A0E06;
  border: none;
  border-radius: 30px;
  padding: 10px 16px;
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 18px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
}
.timer-pill-mini-ring { width: 10px; height: 10px; border-radius: 50%; background: #1A0E06; opacity: 0.5; }

.timer-overlay {
  position: fixed;
  inset: 0;
  background: var(--bg);
  z-index: 95;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
}
.timer-overlay-label {
  font-size: 13px;
  letter-spacing: 0.1em;
  color: var(--text-dim);
  text-transform: uppercase;
  font-weight: 600;
}
.timer-overlay-ring { position: relative; width: 240px; height: 240px; }
.timer-svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.timer-track { fill: none; stroke: var(--border); stroke-width: 10; }
.timer-progress {
  fill: none;
  stroke: var(--accent);
  stroke-width: 10;
  stroke-linecap: round;
  stroke-dasharray: 565.5;
  transition: stroke-dashoffset 0.25s linear;
}
.timer-overlay-number {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 56px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.timer-overlay-actions { display: flex; gap: 14px; margin-top: 8px; }
.timer-action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 30px;
  padding: 11px 20px;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
}
.timer-action-skip { color: var(--accent); border-color: var(--accent-dim); }

@media (prefers-reduced-motion: reduce) {
  .timer-progress { transition: none; }
}
`;
