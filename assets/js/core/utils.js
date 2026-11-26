// Shared DOM and formatting helpers.
const $ = id => document.getElementById(id);
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e };
const role = () => prof ? prof.role : "pending";
const nm = id => (profs.find(p => p.id === id) || {}).name || "";
const HT = { temp: ["🌡 Temperature", "°F"], weight: ["⚖ Weight", "kg"], height: ["📏 Height", "cm"], med: ["💊 Medicine", ""], sym: ["🤒 Symptom", ""], doc: ["🩺 Doctor visit", ""], vac: ["💉 Vaccine", ""] };
const hsub = i => i.sub || (i.num ? "temp" : "sym");
const age = d => { if (!d) return ""; const b = new Date(d), n = new Date(); let mo = (n.getFullYear() - b.getFullYear()) * 12 + n.getMonth() - b.getMonth(); if (n.getDate() < b.getDate()) mo--; mo = Math.max(mo, 0); return mo < 12 ? mo + " mo" : Math.floor(mo / 12) + " yrs" };
const PD = () => typeof PHONE_DOMAIN !== "undefined" ? PHONE_DOMAIN : "mytracker.family";
const PE = () => typeof PHONE_EMAIL !== "undefined" && PHONE_EMAIL.includes("@") ? PHONE_EMAIL.toLowerCase().split("@") : null;
const toEmail = v => { v = (v || "").trim(); if (v.includes("@")) return v.toLowerCase(); let d = v.replace(/\D/g, ""); if (d.length === 10) d = "91" + d; if (!d) return v; const pe = PE(); return pe ? pe[0] + "+" + d + "@" + pe[1] : d + "@" + PD() };
const shown = e => { if (!e) return e; const x = e.toLowerCase(), pe = PE(); if (pe) { const pre = pe[0] + "+", suf = "@" + pe[1]; if (x.startsWith(pre) && x.endsWith(suf)) { const m = x.slice(pre.length, x.length - suf.length); if (/^\d+$/.test(m)) return "+" + m } } return x.endsWith("@" + PD()) ? "+" + x.split("@")[0] : e };
const tm = t => t ? new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
const kl = k => k.name + (k.dob ? ", " + age(k.dob) : "");
const msg = t => { $("st").textContent = t || "" };
