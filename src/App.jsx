import React, { useState, useEffect, useMemo } from "react";
import {
  UtensilsCrossed, GraduationCap, Utensils, Backpack, Eraser,
  Dumbbell, GlassWater, Pill, Blinds,
  ChevronLeft, ChevronRight, Flame, RotateCcw, Pause,
  Plus, Trash2, X,
} from "lucide-react";
import { LocalNotifications } from "@capacitor/local-notifications";
import { AppLauncher } from "@capacitor/app-launcher";

// Abrir otra app por package: ejercicio (com.rutina.ejercicio) o Forest (cc.forestapp).
const openApp = async (pkg) => {
  try { await AppLauncher.openUrl({ url: pkg }); } catch (e) { /* no instalada */ }
};

// Comida: abrir cámara y compartir la foto al grupo "Comidas" de Telegram.
// label viaja como texto para que el asistente sepa qué comida es (Cena, etc.).
const captureMeal = (label) => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.capture = "environment";
  input.style.display = "none";
  input.onchange = async () => {
    const file = input.files && input.files[0];
    if (input.parentNode) input.parentNode.removeChild(input);
    if (!file) return;
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: label });
        return;
      }
    } catch (e) { /* cancelado o no soportado */ }
    try { await AppLauncher.openUrl({ url: "tg://" }); } catch (e) { /* sin Telegram */ }
  };
  document.body.appendChild(input);
  input.click();
};

const READ_TIMER_NOTIF_ID = 1001;
const READ_TIMER_MIN = 30;

// -- Paleta noche ------------------------------------------------
const C = {
  bg: "#14132B",
  panel: "#1E1C3D",
  panelSoft: "#252248",
  border: "#332F5C",
  cream: "#EDE7D4",
  muted: "#8C88B4",
  amber: "#E9B44C",
  moonDark: "#0E0D22",
};

// Ejercicio fuerte de noche, FIJO por día de la semana:
//   Lun=Calistenia, Mar=Press, Mié=Pierna, Jue=Calistenia, Sáb=Press.
// Vie y Dom NO tienen ejercicio (ni estiramiento): descanso total.
const CAL_PM = { key: "ejercicio", label: "Calistenia", Icon: Dumbbell, color: "#E08A3C", launch: "com.rutina.ejercicio", launchLabel: "Abrir app de ejercicio" };
const PRESS = { key: "ejercicio", label: "Press", Icon: Dumbbell, color: "#E08A3C", launch: "com.rutina.ejercicio", launchLabel: "Abrir app de ejercicio" };
const PIERNA = { key: "ejercicio", label: "Pierna", Icon: Dumbbell, color: "#E08A3C", launch: "com.rutina.ejercicio", launchLabel: "Abrir app de ejercicio" };
const EXERCISE_BY_DOW = {
  1: CAL_PM,  // lunes
  2: PRESS,   // martes
  3: PIERNA,  // miércoles
  4: CAL_PM,  // jueves
  6: PRESS,   // sábado
};
const exercisePM = (d) => EXERCISE_BY_DOW[d.getDay()] || null; // vie/dom: sin ejercicio

// Último paso: depende de si AL DÍA SIGUIENTE voy a la oficina.
// Oficina por defecto: jueves (4). Puede cambiar semana a semana; para esas
// semanas agregar overrides por fecha ISO (YYYY-MM-DD): true = ese día SÍ voy,
// false = ese día no voy (aunque sea jueves).
const OFFICE_DOW = new Set([5]);
const OFFICE_OVERRIDES = {
  // Semana del 20/10/2026: esta semana voy el viernes en vez del jueves.
  "2026-10-22": false,
  "2026-10-23": true,
};
const isoDay = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const isOfficeDay = (d) => {
  const o = OFFICE_OVERRIDES[isoDay(d)];
  return o !== undefined ? o : OFFICE_DOW.has(d.getDay());
};
const goesToOfficeNextDay = (d) => {
  const n = new Date(d);
  n.setDate(n.getDate() + 1);
  return isOfficeDay(n);
};
const mochilaFor = (d) =>
  goesToOfficeNextDay(d)
    ? { key: "mochila", label: "Preparar mochila y ropa", Icon: Backpack, color: "#8FBF8F", modal: true }
    : { key: "mochila", label: "Despejar escritorio", Icon: Eraser, color: "#8FBF8F" };

const habitsForDate = (d) => [
  // El entrenamiento va primero de todo (antes de la cena) los días que hay.
  ...(exercisePM(d) ? [exercisePM(d)] : []),
  // Cerrar persianas: todos los días, después del entrenamiento y antes de la cena.
  { key: "persianas", label: "Cerrar persianas", Icon: Blinds, color: "#9B8CD8" },
  { key: "cena", label: "Cena", Icon: UtensilsCrossed, color: "#E2704F", meal: true, mealLabel: "Sacar foto y registrar" },
  { key: "boludeo", label: "Lavar los platos", Icon: Utensils, color: "#C9A227" },
  { key: "agua", label: "Cargar Agua", Icon: GlassWater, color: "#6C8EEF" },
  { key: "estudio_noc", label: "Estudio Nocturno", Icon: GraduationCap, color: "#7FB3E0", launch: "com.checklist.facu", launchLabel: "Abrir Checklist" },
  mochilaFor(d),
  { key: "pastillas", label: "Pastillas", Icon: Pill, color: "#D96C9E" },
];

const STORAGE_KEY = "night_routine_data_v1";
const BAG_KEY = "night_backpack_items_v1";

// Ítems por defecto de la mochila/ropa (lista editable desde la app).
const DEFAULT_BAG = [
  "Notebook", "Cargador", "Ropa del día", "Botella de agua", "Llaves", "Auriculares",
].map((label, i) => ({ id: `d${i}`, label }));

// Un ítem de mochila marcado del día se guarda como `mochila_<id>` dentro del día.
const bagKeyFor = (id) => `mochila_${id}`;

// -- Almacenamiento local (localStorage) --------------------------
const storage = {
  async get(key) {
    const value = window.localStorage.getItem(key);
    return value === null ? null : { value };
  },
  async set(key, value) {
    window.localStorage.setItem(key, value);
  },
  async delete(key) {
    window.localStorage.removeItem(key);
  },
};

// -- Helpers de fecha ----------------------------------------------
const toKey = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const startOfWeek = (d) => {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7; // 0 = lunes
  return addDays(x, -dow);
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtTime = (totalSeconds) => {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

// -- Luna que se llena con la luz -----------------------------------
function Moon({ size, fraction, id }) {
  const r = size / 2;
  const clipId = `moonclip-${id}`;
  const gradId = `moongrad-${id}`;
  const fillH = fraction * size;
  const full = fraction >= 1;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ filter: full ? "drop-shadow(0 0 10px rgba(240,200,98,.55))" : "none", transition: "filter .5s" }}
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx={r} cy={r} r={r - 1} />
        </clipPath>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFF7E0" />
          <stop offset="100%" stopColor="#F0C862" />
        </linearGradient>
      </defs>
      <circle cx={r} cy={r} r={r - 1} fill={C.moonDark} stroke={C.border} strokeWidth="1.5" />
      <g clipPath={`url(#${clipId})`}>
        <rect x="0" y={size - fillH} width={size} height={fillH} fill={`url(#${gradId})`} style={{ transition: "y .5s ease, height .5s ease" }} />
      </g>
      <circle cx={r} cy={r} r={r - 1} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="1" />
    </svg>
  );
}

export default function App() {
  const [data, setData] = useState({});
  const [bagItems, setBagItems] = useState(DEFAULT_BAG);
  const [bagOpen, setBagOpen] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [loading, setLoading] = useState(true);
  // El "día" de la rutina nocturna arranca a las 03:00: si abro la app entre
  // medianoche y las 3 AM, sigo viendo el día anterior (me quedo despierto hasta tarde).
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(d.getHours() - 3);
    return d;
  }, []);
  const [selected, setSelected] = useState(toKey(today));
  const [weekBase, setWeekBase] = useState(startOfWeek(today));

  // Temporizador de lectura (Libro): cuenta regresiva independiente de si ya se marcó como completada
  const [timer, setTimer] = useState({ running: false, dateKey: null, startedAt: null, targetSeconds: 0 });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!timer.running) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [timer.running]);

  // Cargar
  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get(STORAGE_KEY);
        if (res && res.value) setData(JSON.parse(res.value));
        const bag = await storage.get(BAG_KEY);
        if (bag && bag.value) {
          const parsed = JSON.parse(bag.value);
          if (Array.isArray(parsed)) setBagItems(parsed);
        }
      } catch (e) {
        // primera vez: sin datos
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async (next) => {
    try {
      await storage.set(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      // si falla, el estado en pantalla se mantiene igualmente
    }
  };

  const saveBag = async (next) => {
    setBagItems(next);
    try { await storage.set(BAG_KEY, JSON.stringify(next)); } catch (e) {}
  };

  // "Preparar mochila y ropa" se completa cuando todos sus ítems están marcados ese día.
  const isDone = (key, habit) => {
    const h = data[key] || {};
    if (habit.modal) {
      if (bagItems.length === 0) return false;
      return bagItems.every((it) => h[bagKeyFor(it.id)]);
    }
    return !!h[habit.key];
  };

  const toggle = (habitKey) => {
    const cur = data[selected] || {};
    const nextNight = { ...cur, [habitKey]: !cur[habitKey] };
    const next = { ...data, [selected]: nextNight };
    setData(next);
    save(next);
  };

  const toggleBagItem = (id) => {
    const cur = data[selected] || {};
    const k = bagKeyFor(id);
    const nextNight = { ...cur, [k]: !cur[k] };
    const next = { ...data, [selected]: nextNight };
    setData(next);
    save(next);
  };

  const addBagItem = () => {
    const label = newItem.trim();
    if (!label) return;
    saveBag([...bagItems, { id: `i${Date.now()}`, label }]);
    setNewItem("");
  };

  const removeBagItem = (id) => {
    saveBag(bagItems.filter((it) => it.id !== id));
  };

  // -- Temporizador de lectura (cuenta regresiva) ---------------------
  const readSecondsFor = (dateKey) => (data[dateKey] && data[dateKey].libroSeconds) || 0;

  const bankSeconds = (dateKey, seconds) => {
    if (seconds <= 0) return;
    const cur = data[dateKey] || {};
    const nextNight = { ...cur, libroSeconds: (cur.libroSeconds || 0) + seconds };
    const next = { ...data, [dateKey]: nextNight };
    setData(next);
    save(next);
  };

  const remainingSecondsFor = (dateKey) => {
    if (!(timer.running && timer.dateKey === dateKey)) return null;
    const elapsed = Math.floor((Date.now() - timer.startedAt) / 1000);
    return Math.max(timer.targetSeconds - elapsed, 0);
  };

  const startTimer = async (e) => {
    e.stopPropagation();
    const targetSeconds = READ_TIMER_MIN * 60;
    const startedAt = Date.now();
    setTimer({ running: true, dateKey: selected, startedAt, targetSeconds });
    try {
      const perm = await LocalNotifications.requestPermissions();
      if (perm.display === "granted") {
        await LocalNotifications.schedule({
          notifications: [{
            id: READ_TIMER_NOTIF_ID,
            title: "Rutina nocturna",
            body: "Terminó tu tiempo de lectura 📖",
            schedule: { at: new Date(startedAt + targetSeconds * 1000) },
          }],
        });
      }
    } catch (err) {
      // sin notificaciones disponibles: el temporizador sigue funcionando igual
    }
  };

  const cancelNotification = async () => {
    try {
      await LocalNotifications.cancel({ notifications: [{ id: READ_TIMER_NOTIF_ID }] });
    } catch (err) {}
  };

  const pauseTimer = (e) => {
    e.stopPropagation();
    const elapsed = Math.min(Math.floor((Date.now() - timer.startedAt) / 1000), timer.targetSeconds);
    bankSeconds(timer.dateKey, elapsed);
    cancelNotification();
    setTimer({ running: false, dateKey: null, startedAt: null, targetSeconds: 0 });
  };

  // Finaliza sola cuando la cuenta regresiva llega a cero
  useEffect(() => {
    if (!timer.running) return;
    const elapsed = Math.floor((Date.now() - timer.startedAt) / 1000);
    if (elapsed >= timer.targetSeconds) {
      bankSeconds(timer.dateKey, timer.targetSeconds);
      setTimer({ running: false, dateKey: null, startedAt: null, targetSeconds: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const countFor = (key) => {
    const habits = habitsForDate(new Date(key + "T12:00:00"));
    return habits.reduce((n, x) => n + (isDone(key, x) ? 1 : 0), 0);
  };
  const totalFor = (key) => habitsForDate(new Date(key + "T12:00:00")).length;

  // Racha de noches completas, terminando hoy o ayer
  const streak = useMemo(() => {
    let cursor = new Date(today);
    if (countFor(toKey(today)) < totalFor(toKey(today))) cursor = addDays(cursor, -1);
    let n = 0;
    for (let i = 0; i < 400; i++) {
      const k = toKey(cursor);
      if (countFor(k) === totalFor(k)) {
        n++;
        cursor = addDays(cursor, -1);
      } else break;
    }
    return n;
  }, [data, today]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekBase, i)), [weekBase]);
  const dayLetters = ["L", "M", "X", "J", "V", "S", "D"];

  const selDate = new Date(selected + "T12:00:00");
  const selHabits = habitsForDate(selDate);
  const selCount = countFor(selected);
  const selTotal = selHabits.length;
  const isToday = selected === toKey(today);

  const weekLabel = `${weekDays[0].toLocaleDateString("es-ES", { day: "numeric" })}–${weekDays[6].toLocaleDateString("es-ES", { day: "numeric", month: "short" })}`;

  const reset = async () => {
    if (!window.confirm("¿Borrar todo tu progreso? No se puede deshacer.")) return;
    setData({});
    try { await storage.delete(STORAGE_KEY); } catch (e) {}
  };

  if (loading) {
    return (
      <div style={{ ...wrap, alignItems: "center", justifyContent: "center", minHeight: 480 }}>
        <div style={{ color: C.muted, fontFamily: "system-ui" }}>Cargando tu cielo…</div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <style>{`
        .nr-tap{ -webkit-tap-highlight-color:transparent; cursor:pointer; }
        .nr-tap:focus-visible{ outline:2px solid ${C.amber}; outline-offset:2px; }
        .nr-row{ transition:background .18s ease, border-color .18s ease; }
        .nr-row:hover{ background:${C.panelSoft}; }
        @media (prefers-reduced-motion: reduce){ *{ transition:none!important; } }
      `}</style>

      {/* estrellas tenues */}
      <div style={stars} aria-hidden>
        {[[18, 30], [78, 22], [90, 60], [12, 70], [55, 14], [40, 48]].map(([l, t], i) => (
          <span key={i} style={{ position: "absolute", left: `${l}%`, top: `${t}px`, width: 2, height: 2, borderRadius: 9, background: C.cream, opacity: 0.35 }} />
        ))}
      </div>

      {/* encabezado */}
      <header style={{ position: "relative", zIndex: 1 }}>
        <div style={{ fontFamily: "'Iowan Old Style','Palatino',Georgia,serif", fontSize: 26, color: C.cream, letterSpacing: 0.3 }}>
          Rutina nocturna
        </div>
        <div style={{ color: C.muted, fontSize: 13, marginTop: 2, fontFamily: "system-ui" }}>
          {cap(selDate.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }))}
          {isToday && <span style={{ color: C.amber }}> · hoy</span>}
        </div>
      </header>

      {/* luna + conteo */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, margin: "6px 0 2px", position: "relative", zIndex: 1 }}>
        <Moon size={116} fraction={selCount / selTotal} id="big" />
        <div style={{ fontFamily: "'Iowan Old Style','Palatino',Georgia,serif", fontSize: 20, color: C.cream }}>
          {selCount} <span style={{ color: C.muted }}>/ {selTotal}</span>
        </div>
      </div>

      {/* hábitos */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, position: "relative", zIndex: 1 }}>
        {selHabits.map((habit) => {
          const { key, label, Icon, color, modal, launch, launchLabel, meal, mealLabel } = habit;
          const done = isDone(selected, habit);
          const isLibro = key === "libro";
          const timerRunning = isLibro && timer.running && timer.dateKey === selected;
          const act = () => (modal ? setBagOpen(true) : meal ? captureMeal(label) : launch ? openApp(launch) : toggle(key));
          const bagSub = modal
            ? `${bagItems.filter((it) => data[selected] && data[selected][bagKeyFor(it.id)]).length}/${bagItems.length} ítems`
            : null;
          return (
            <div
              key={key}
              className="nr-tap nr-row"
              role={modal || launch || meal ? "button" : "checkbox"}
              aria-checked={modal || launch || meal ? undefined : done}
              tabIndex={0}
              onClick={act}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(); } }}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "13px 14px", borderRadius: 14,
                background: C.panel, border: `1px solid ${done ? color : C.border}`,
              }}
            >
              <span style={{ display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: 10, background: done ? color : C.panelSoft, transition: "background .2s" }}>
                <Icon size={18} color={done ? C.bg : color} strokeWidth={2} />
              </span>
              <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                <span style={{ color: C.cream, fontSize: 16, fontFamily: "system-ui", opacity: done ? 1 : 0.85 }}>{label}</span>
                {launch && <span style={{ color: C.muted, fontSize: 12, fontFamily: "system-ui" }}>{launchLabel}</span>}
                {meal && <span style={{ color: C.muted, fontSize: 12, fontFamily: "system-ui" }}>{mealLabel}</span>}
                {modal && <span style={{ color: C.muted, fontSize: 12, fontFamily: "system-ui" }}>{bagSub}</span>}
                {isLibro && (
                  timerRunning ? (
                    <span
                      className="nr-tap"
                      role="button"
                      aria-label="Pausar temporizador de lectura"
                      tabIndex={0}
                      onClick={pauseTimer}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pauseTimer(e); } }}
                      style={{ display: "flex", alignItems: "center", gap: 5, width: "fit-content" }}
                    >
                      <Pause size={13} color={color} />
                      <span style={{ fontSize: 12, fontFamily: "system-ui", color }}>
                        {fmtTime(remainingSecondsFor(selected))} restantes
                      </span>
                    </span>
                  ) : (
                    <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span
                        className="nr-tap"
                        role="button"
                        aria-label={`Leer ${READ_TIMER_MIN} minutos`}
                        tabIndex={0}
                        onClick={startTimer}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); startTimer(e); } }}
                        style={{
                          fontSize: 11, fontFamily: "system-ui", color: C.muted,
                          border: `1px solid ${C.border}`, borderRadius: 999, padding: "2px 8px",
                        }}
                      >
                        {READ_TIMER_MIN} min
                      </span>
                      {readSecondsFor(selected) > 0 && (
                        <span style={{ fontSize: 11, fontFamily: "system-ui", color: C.muted }}>
                          leído hoy: {fmtTime(readSecondsFor(selected))}
                        </span>
                      )}
                    </span>
                  )
                )}
              </span>
              <span
                className={launch || meal ? "nr-tap" : undefined}
                role={launch || meal ? "checkbox" : undefined}
                aria-checked={launch || meal ? done : undefined}
                tabIndex={launch || meal ? 0 : undefined}
                aria-label={launch || meal ? `Marcar ${label} como hecho` : undefined}
                onClick={launch || meal ? (e) => { e.stopPropagation(); toggle(key); } : undefined}
                onKeyDown={launch || meal ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); toggle(key); } } : undefined}
                style={{
                width: 24, height: 24, borderRadius: 999,
                border: `2px solid ${done ? color : C.border}`,
                background: done ? color : "transparent",
                display: "grid", placeItems: "center", transition: "all .2s", flexShrink: 0,
              }}>
                {done && (
                  <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2.5 6.3 5 8.7l4.5-5" fill="none" stroke={C.bg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* semana */}
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: "12px 12px 14px", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <button className="nr-tap" aria-label="Semana anterior" onClick={() => setWeekBase(addDays(weekBase, -7))} style={navBtn}>
            <ChevronLeft size={18} color={C.muted} />
          </button>
          <span style={{ color: C.cream, fontSize: 13, fontFamily: "system-ui", letterSpacing: 0.3 }}>{weekLabel}</span>
          <button className="nr-tap" aria-label="Semana siguiente" onClick={() => setWeekBase(addDays(weekBase, 7))} style={navBtn}>
            <ChevronRight size={18} color={C.muted} />
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
          {weekDays.map((d, i) => {
            const k = toKey(d);
            const frac = countFor(k) / totalFor(k);
            const isSel = k === selected;
            const isFuture = d > today && k !== toKey(today);
            return (
              <button
                key={k}
                className="nr-tap"
                onClick={() => setSelected(k)}
                aria-label={`Ver ${d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric" })}`}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                  background: isSel ? C.panelSoft : "transparent",
                  border: `1px solid ${isSel ? C.amber : "transparent"}`,
                  borderRadius: 12, padding: "7px 0 6px", opacity: isFuture ? 0.4 : 1,
                }}
              >
                <span style={{ fontSize: 11, color: k === toKey(today) ? C.amber : C.muted, fontFamily: "system-ui" }}>{dayLetters[i]}</span>
                <Moon size={26} fraction={frac} id={`w${i}`} />
              </button>
            );
          })}
        </div>
      </div>

      {/* racha */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.cream, fontFamily: "system-ui", fontSize: 14 }}>
          <Flame size={18} color={streak > 0 ? C.amber : C.muted} fill={streak > 0 ? C.amber : "none"} />
          {streak > 0 ? (
            <span><b>{streak}</b> {streak === 1 ? "noche completa" : "noches completas"} seguidas</span>
          ) : (
            <span style={{ color: C.muted }}>Completa las {selTotal} para empezar tu racha</span>
          )}
        </div>
        <button className="nr-tap" onClick={reset} aria-label="Borrar datos" style={{ ...navBtn, width: 32, height: 32 }}>
          <RotateCcw size={15} color={C.muted} />
        </button>
      </div>

      {/* pop-up: lista de la mochila y ropa (editable) */}
      {bagOpen && (
        <div
          onClick={() => setBagOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 10,
            background: "rgba(10,9,26,.6)", display: "flex",
            alignItems: "flex-end", justifyContent: "center",
            padding: "0 0 env(safe-area-inset-bottom)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 420, background: C.bg,
              borderTopLeftRadius: 22, borderTopRightRadius: 22,
              border: `1px solid ${C.border}`, borderBottom: "none",
              padding: "16px 18px calc(20px + env(safe-area-inset-bottom))",
              maxHeight: "80vh", display: "flex", flexDirection: "column", gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: 10, background: "#8FBF8F" }}>
                <Backpack size={18} color={C.bg} strokeWidth={2} />
              </span>
              <span style={{ flex: 1, fontFamily: "'Iowan Old Style','Palatino',Georgia,serif", fontSize: 19, color: C.cream }}>
                Preparar mochila y ropa
              </span>
              <button className="nr-tap" aria-label="Cerrar" onClick={() => setBagOpen(false)} style={{ ...navBtn, width: 32, height: 32 }}>
                <X size={16} color={C.muted} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
              {bagItems.length === 0 && (
                <div style={{ color: C.muted, fontSize: 14, fontFamily: "system-ui", padding: "8px 2px" }}>
                  Agregá lo que no te puede faltar.
                </div>
              )}
              {bagItems.map((it) => {
                const checked = !!(data[selected] && data[selected][bagKeyFor(it.id)]);
                return (
                  <div
                    key={it.id}
                    className="nr-row"
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "11px 12px", borderRadius: 12,
                      background: C.panel, border: `1px solid ${checked ? "#8FBF8F" : C.border}`,
                    }}
                  >
                    <span
                      className="nr-tap"
                      role="checkbox" aria-checked={checked} tabIndex={0}
                      onClick={() => toggleBagItem(it.id)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleBagItem(it.id); } }}
                      style={{ flex: 1, display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}
                    >
                      <span style={{
                        width: 22, height: 22, borderRadius: 999,
                        border: `2px solid ${checked ? "#8FBF8F" : C.border}`,
                        background: checked ? "#8FBF8F" : "transparent",
                        display: "grid", placeItems: "center", transition: "all .2s", flexShrink: 0,
                      }}>
                        {checked && (
                          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2.5 6.3 5 8.7l4.5-5" fill="none" stroke={C.bg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        )}
                      </span>
                      <span style={{ color: C.cream, fontSize: 15, fontFamily: "system-ui", opacity: checked ? 1 : 0.9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>
                    </span>
                    <button className="nr-tap" aria-label={`Quitar ${it.label}`} onClick={() => removeBagItem(it.id)} style={{ ...navBtn, width: 30, height: 30, border: "none" }}>
                      <Trash2 size={15} color={C.muted} />
                    </button>
                  </div>
                );
              })}
            </div>

            <form onSubmit={(e) => { e.preventDefault(); addBagItem(); }} style={{ display: "flex", gap: 8, marginTop: 2 }}>
              <input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                placeholder="Agregar ítem…"
                style={{
                  flex: 1, padding: "11px 12px", borderRadius: 12,
                  border: `1px solid ${C.border}`, background: C.panel,
                  color: C.cream, fontSize: 15, fontFamily: "system-ui", outline: "none",
                }}
              />
              <button type="submit" className="nr-tap" aria-label="Agregar" style={{
                width: 46, borderRadius: 12, border: "none", background: "#8FBF8F",
                display: "grid", placeItems: "center",
              }}>
                <Plus size={20} color={C.bg} />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const wrap = {
  maxWidth: 420, margin: "0 auto",
  paddingTop: "calc(22px + env(safe-area-inset-top))",
  paddingRight: "calc(18px + env(safe-area-inset-right))",
  paddingBottom: "calc(24px + env(safe-area-inset-bottom))",
  paddingLeft: "calc(18px + env(safe-area-inset-left))",
  display: "flex", flexDirection: "column", gap: 16,
  background: C.bg, borderRadius: 20, position: "relative", overflow: "hidden",
  fontFamily: "system-ui, sans-serif",
};
const stars = { position: "absolute", inset: 0, height: 120, pointerEvents: "none" };
const navBtn = {
  width: 30, height: 30, borderRadius: 9, border: `1px solid ${C.border}`,
  background: "transparent", display: "grid", placeItems: "center",
  cursor: "pointer", WebkitTapHighlightColor: "transparent",
};
