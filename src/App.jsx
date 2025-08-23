import React, { useEffect, useMemo, useRef, useState } from "react";

/** ======= Hjälpfunktioner ======= */
const TZ = "Europe/Stockholm";

function toTime(t) {
  if (typeof t === "number") {
    const h = Math.floor(t / 100), m = t % 100;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
  }
  return String(t);
}

function parseHHMM(str) {
  const [h, m] = String(str).split(":").map(Number);
  return { h: h || 0, m: m || 0 };
}

function addMinutesToHHMM(hhmm, minutes) {
  const { h, m } = parseHHMM(hhmm);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  d.setMinutes(d.getMinutes() + minutes);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

function dateKey(d) { return d.toISOString().slice(0,10); }

function inDST(date) {
  // Enkel DST-detektion för Sverige via offset
  const jan = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const jul = new Date(Date.UTC(date.getUTCFullYear(), 6, 1));
  const stdOffset = Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
  return date.getTimezoneOffset() < stdOffset;
}

function jumuahTimeFor(date) {
  return inDST(date) ? "13:15" : "12:15";
}

function nextPrayer(now, todayTimes) {
  if (!todayTimes) return null;
  const order = [
    { key: "Fajr", label: "Fajr" },
    { key: "Sunrise", label: "Soluppgång" },
    { key: "Dhuhr", label: "Dhuhr" },
    { key: "Asr", label: "Asr" },
    { key: "Maghrib", label: "Maghrib" },
    { key: "Isha", label: "Isha" },
  ];
  for (const o of order) {
    const t = todayTimes[o.key];
    if (!t) continue;
    const [hh, mm] = t.split(":").map(Number);
    const nd = new Date(now);
    nd.setHours(hh, mm, 0, 0);
    if (nd > now) return { key: o.key, label: o.label, time: t, date: nd };
  }
  return null;
}

function formatCountdown(ms) {
  if (ms <= 0) return "Nu";
  const s = Math.floor(ms/1000);
  const h = Math.floor(s/3600);
  const m = Math.floor((s%3600)/60);
  const sec = s%60;
  if (h > 0) return `${h} h ${m} min ${sec} s`;
  if (m > 0) return `${m} min ${sec} s`;
  return `${sec} s`;
}

/** ======= Enkel stil utan externa bibliotek ======= */
const S = {
  page: { fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", padding: 16, maxWidth: 1100, margin: "0 auto" },
  h1: { fontSize: 28, margin: "8px 0" },
  row: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginTop: 12 },
  card: { border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" },
  label: { fontSize: 12, color: "#64748b" },
  val: { fontWeight: 600 },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 },
  small: { fontSize: 12, color: "#64748b" },
  input: { padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", width: "100%" },
  btn: { padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#f8fafc", cursor: "pointer" },
  tableWrap: { overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 14, background: "#fff" },
  table: { borderCollapse: "collapse", width: "100%", fontSize: 14 },
  th: { textAlign: "left", background: "#f8fafc", padding: "8px 10px", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" },
  td: { padding: "8px 10px", borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" },
  todayRow: { background: "#fff7ed" },
  chip: { display:"inline-block", padding:"2px 8px", borderRadius: 999, background:"#eef2ff", fontSize:12, color:"#4338ca" },
};

/** ======= Huvudkomponent ======= */
export default function App() {
  const [data, setData] = useState([]);         // årsdata
  const [iqamaOffset, setIqamaOffset] = useState(0); // +10 min
  const [monthStr, setMonthStr] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`; // YYYY-MM
  });
  const [countdown, setCountdown] = useState("");
  const [pasteText, setPasteText] = useState("");

  // 1) Ladda från localStorage, annars försök hämta JSON i public/
  useEffect(() => {
    const saved = localStorage.getItem("got-prayer-2025");
    if (saved) {
      try {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr) && arr.length) { setData(arr); return; }
      } catch {}
    }
    fetch("/goteborg-bonetider-2025.json")
      .then(r => r.ok ? r.json() : [])
      .then(arr => {
        if (Array.isArray(arr) && arr.length) {
          setData(arr);
          localStorage.setItem("got-prayer-2025", JSON.stringify(arr));
        }
      })
      .catch(() => {});
  }, []);

  // Index per datum
  const byDate = useMemo(() => {
    const m = new Map();
    for (const r of data) m.set(r.date, r);
    return m;
  }, [data]);

  const today = new Date();
  const todayIso = dateKey(today);
  const todayTimesRaw = byDate.get(todayIso) || null;

  const todayTimes = useMemo(() => {
    if (!todayTimesRaw) return null;
    const t = { ...todayTimesRaw };
    if (iqamaOffset) {
      ["Fajr","Dhuhr","Asr","Maghrib","Isha"].forEach(k => { if (t[k]) t[k] = addMinutesToHHMM(t[k], iqamaOffset); });
    }
    return t;
  }, [todayTimesRaw, iqamaOffset]);

  // Nedräkning
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const base = iqamaOffset ? todayTimes : todayTimesRaw;
      if (!base) { setCountdown(""); return; }
      const np = nextPrayer(now, base);
      if (!np) { setCountdown("Alla dagens böner har passerat"); return; }
      const ms = np.date.getTime() - now.getTime();
      setCountdown(`${np.label} ${np.time} om ${formatCountdown(ms)}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [todayTimes, todayTimesRaw, iqamaOffset]);

  // Månadens rader
  const monthRows = useMemo(() => {
    const [y, m] = monthStr.split("-").map(Number);
    const days = new Date(y, m, 0).getDate();
    const arr = [];
    for (let d=1; d<=days; d++) {
      const iso = `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      arr.push({ date: iso, ...(byDate.get(iso) || {}) });
    }
    return arr;
  }, [monthStr, byDate]);

  // Import-hjälp
  function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    const header = lines.shift().split(",").map(s => s.trim().toLowerCase());
    const idx = Object.fromEntries(header.map((h,i)=>[h,i]));
    const out = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      const cols = line.split(",").map(s=>s.trim());
      let d = cols[idx["date"]] || cols[idx["datum"]] || cols[0];
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) { const [dd,mm,yyyy]=d.split("/"); d = `${yyyy}-${mm}-${dd}`; }
      const row = {
        date: d,
        Fajr: toTime(cols[idx["fajr"]]),
        Sunrise: toTime(cols[idx["sunrise"]] || cols[idx["solupp"]] || cols[idx["soluppg"]]),
        Dhuhr: toTime(String(cols[idx["dhuhr"]] || cols[idx["zuhr"]]).replace(/[()]/g,"")),
        Asr: toTime(cols[idx["asr"]]),
        Maghrib: toTime(cols[idx["maghrib"]]),
        Isha: toTime(cols[idx["isha"]]),
      };
      out.push(row);
    }
    return out;
  }

  function handleFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result);
        const parsed = file.name.endsWith(".json") ? JSON.parse(text) : parseCSV(text);
        if (!Array.isArray(parsed) || !parsed.length) throw new Error("Tom eller felaktig fil.");
        setData(parsed);
        localStorage.setItem("got-prayer-2025", JSON.stringify(parsed));
        alert("Importerade bönetider ✔");
      } catch (e) { alert("Kunde inte tolka filen: " + e.message); }
    };
    reader.readAsText(file);
  }

  /** ======= UI ======= */
  return (
    <div style={S.page}>
      <div>
        <div style={{display:"flex", alignItems:"center", gap:10}}>
          <div style={S.chip}>Göteborg</div>
          <h1 style={S.h1}>Bönetider</h1>
        </div>
        <div style={{...S.small, marginTop: 4}}>
          Tidszon: Europe/Stockholm • Källan: Göteborgs Moské / awqatsalah.com
        </div>
      </div>

      <div style={S.row}>
        {/* Idag */}
        <div style={S.card}>
          <div style={{fontWeight:700, marginBottom:8}}>Idag</div>
          <div style={S.small}>
            {new Intl.DateTimeFormat("sv-SE", { dateStyle:"full", timeZone: TZ }).format(new Date())}
          </div>

          {todayTimes ? (
            <div style={S.grid2}>
              {[
                ["Fajr","Fajr"],
                ["Sunrise","Soluppg."],
                ["Dhuhr","Dhuhr"],
                ["Asr","Asr"],
                ["Maghrib","Maghrib"],
                ["Isha","Isha"],
              ].map(([k,label]) => (
                <div key={k} style={{display:"flex", justifyContent:"space-between", border:"1px solid #e5e7eb", borderRadius:12, padding:"8px 10px", background:"#fff"}}>
                  <span>{label}</span>
                  <span style={{...S.val, fontVariantNumeric:"tabular-nums"}}>{todayTimes[k] ?? "–"}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{marginTop:8, ...S.small}}>Saknar tider för idag. Importera årsdata nedan.</div>
          )}

          <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:12}}>
            <div style={{fontWeight:600}}>{countdown}</div>
            <label style={{display:"flex", alignItems:"center", gap:8, fontSize:14}}>
              <input
                type="checkbox"
                checked={iqamaOffset === 10}
                onChange={(e)=> setIqamaOffset(e.target.checked ? 10 : 0)}
              />
              Iqama +10 min
            </label>
          </div>
        </div>

        {/* Fredagsbön */}
        <div style={S.card}>
          <div style={{fontWeight:700, marginBottom:8}}>Fredagsbön (Jumu'ah)</div>
          <div style={{fontSize:14}}>
            Azan: <b>{jumuahTimeFor(new Date())}</b> (12:15 vintertid, 13:15 sommartid)
          </div>
          <div style={{...S.small, marginTop:8}}>Iqama ca 10 min efter azan enligt Göteborgs Moské.</div>
          <div style={{fontSize:13, marginTop:10}}>Göteborgs Moské, Myntgatan 4, 417 02 Göteborg • 031-22 29 33</div>
        </div>

        {/* Månadsväljare */}
        <div style={S.card}>
          <div style={{fontWeight:700, marginBottom:8}}>Välj månad</div>
          <input type="month" value={monthStr} onChange={(e)=>setMonthStr(e.target.value)} style={S.input} />
          <div style={{...S.small, marginTop:8}}>Tips: Hoppa till aktuell månad och scrolla i tabellen nedan.</div>
        </div>
      </div>

      {/* Tabell */}
      <div style={{marginTop:16}}>
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                {["Datum","Fajr","Soluppg.","Dhuhr","Asr","Maghrib","Isha"].map(h=>(
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthRows.map(r => {
                const isToday = r.date === todayIso;
                return (
                  <tr key={r.date} style={isToday ? S.todayRow : undefined}>
                    <td style={S.td}>
                      {new Date(r.date+"T00:00:00").toLocaleDateString("sv-SE",{weekday:"short", day:"2-digit", month:"2-digit"})}
                    </td>
                    {["Fajr","Sunrise","Dhuhr","Asr","Maghrib","Isha"].map(k=>{
                      let val = r?.[k] || "–";
                      if (iqamaOffset && k!=="Sunrise" && val!=="–") val = addMinutesToHHMM(val, iqamaOffset);
                      return <td key={k} style={S.td}><span style={{fontVariantNumeric:"tabular-nums"}}>{val}</span></td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{...S.small, marginTop:6}}>
          Obs: Fredags-Dhuhr i PDF listas ofta som (12:15)/(13:15). Tabellen visar dagliga böner; Jumu’ah visas i rutan ovan.
        </div>
      </div>

      {/* Import-sektion */}
      <div style={{marginTop:16, ...S.card}}>
        <div style={{fontWeight:700, marginBottom:8}}>Importera årsdata (JSON/CSV)</div>
        <div style={{fontSize:14}}>
          Ladda upp <b>goteborg-bonetider-2025.json</b> eller CSV med kolumner:
          <code style={{background:"#f1f5f9", padding:"2px 6px", borderRadius:8, marginLeft:6}}>date,Fajr,Sunrise,Dhuhr,Asr,Maghrib,Isha</code>
        </div>
        <div style={{marginTop:10}}>
          <input type="file" accept=".json,.csv"
                 onChange={(e)=> e.target.files?.[0] && handleFile(e.target.files[0])}/>
        </div>

        <div style={{marginTop:12}}>
          <div style={{fontWeight:600, marginBottom:6}}>Klistra in JSON här (alternativt):</div>
          <textarea
            value={pasteText}
            onChange={(e)=>setPasteText(e.target.value)}
            placeholder='Klistra in hela JSON-innehållet...'
            style={{width:"100%", minHeight:120, border:"1px solid #e5e7eb", borderRadius:12, padding:10}}
          />
          <div style={{display:"flex", gap:8, marginTop:8}}>
            <button
              style={S.btn}
              onClick={()=>{
                try {
                  const parsed = JSON.parse(pasteText);
                  if (!Array.isArray(parsed) || !parsed.length) throw new Error("Tom JSON");
                  setData(parsed);
                  localStorage.setItem("got-prayer-2025", JSON.stringify(parsed));
                  alert("Importerade bönetider från JSON-urklipp ✔");
                } catch(err) {
                  alert("Kunde inte tolka JSON: " + err.message);
                }
              }}
            >Importera från urklipp</button>
            <button style={S.btn} onClick={()=>setPasteText("")}>Rensa</button>
          </div>
        </div>

        <details style={{marginTop:12}}>
          <summary style={{cursor:"pointer", fontWeight:600}}>CSV-exempel</summary>
          <pre style={{background:"#0f172a", color:"#e2e8f0", padding:12, borderRadius:12, overflow:"auto", fontSize:12}}>
{`date,Fajr,Sunrise,Dhuhr,Asr,Maghrib,Isha
2025-01-01,06:25,08:48,12:20,13:29,15:43,17:50
2025-01-02,06:25,08:48,12:21,13:30,15:44,17:51
2025-01-03,06:25,08:48,12:15,13:31,15:45,17:52
... (fortsätt för hela året)`}
          </pre>
        </details>
      </div>

      <div style={{...S.small, marginTop:12}}>
        © {new Date().getFullYear()} Göteborg Bönetider • Endast lokal lagring.
      </div>
    </div>
  );
}
