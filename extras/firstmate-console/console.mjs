import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import { readdirSync, statSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const run = promisify(execFile);
const HOME = homedir();
export const FM_ROOT = process.env.FM_ROOT || join(HOME, "code", "firstmate");
const SESSION = "firstmate";
const WINDOW = "first-mate";
const ENV = { ...process.env, PATH: `${HOME}/.local/bin:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ""}` };
const MODES = ["local-only", "direct-PR", "no-mistakes"];
const KINDS = ["scout", "ship"];

function candidateProjects() {
    const out = [];
    for (const base of [join(HOME, ".copilot", "repos"), join(HOME, "code")]) {
        try {
            for (const name of readdirSync(base)) {
                const p = join(base, name);
                if (name !== "copilot-worktrees" && existsSync(join(p, ".git"))) out.push(p);
            }
        } catch {}
    }
    return out.filter((p) => p !== FM_ROOT);
}

async function sessionAlive() {
    try {
        await run("tmux", ["has-session", "-t", SESSION], { env: ENV });
        return true;
    } catch {
        return false;
    }
}

async function ensureSession() {
    if (await sessionAlive()) return false;
    await run("tmux", ["new-session", "-d", "-s", SESSION, "-n", WINDOW, "-c", FM_ROOT, "copilot --allow-all --no-auto-update"], { env: ENV });
    await new Promise((r) => setTimeout(r, 8000));
    return true;
}

export function buildMessage({ project, kind, mode, task }) {
    if (!KINDS.includes(kind)) throw new Error("kind must be scout or ship");
    if (!MODES.includes(mode)) throw new Error("invalid mode");
    if (typeof task !== "string" || !task.trim() || task.length > 2000) throw new Error("task must be 1-2000 characters");
    if (typeof project !== "string" || !statSafe(project)) throw new Error("project must be an existing directory");
    const clean = task.replace(/\s+/g, " ").trim();
    return `${kind === "scout" ? "Scout" : "Ship"} task for project ${project} (mode: ${mode}; register the project first if it is not registered). ${clean}`;
}

function statSafe(p) {
    try {
        return statSync(p).isDirectory();
    } catch {
        return false;
    }
}

async function sendToFirstMate(message) {
    const started = await ensureSession();
    const target = `${SESSION}:${WINDOW}`;
    await run("tmux", ["send-keys", "-t", target, "-l", message], { env: ENV });
    await run("tmux", ["send-keys", "-t", target, "Enter"], { env: ENV });
    return { sent: true, startedSession: started };
}

const ID_RE = /^[A-Za-z0-9._-]{1,80}$/;

function simplifyFleet(snap) {
    const tasks = (snap.tasks || []).map((t) => ({
        id: t.id,
        kind: t.kind,
        state: t.current_state?.state ?? "unknown",
        source: t.current_state?.source ?? null,
        project: t.backlog?.repo ?? t.project ?? null,
        backend: t.backend ?? null,
        endpoint: t.endpoint?.exists == null ? null : t.endpoint.exists,
        pr: t.pr?.url ?? null,
        report: !!t.paths?.report?.present,
        steerable: t.kind !== "secondmate",
    }));
    const records = snap.backlog?.records || [];
    const pick = (r) => ({ id: r.id ?? null, title: r.title ?? r.raw ?? null, repo: r.repo ?? null, kind: r.kind ?? null, blocked: r.blocked_by ?? null, pr: r.pr_url ?? null });
    return {
        generated: snap.generated,
        tasks,
        queued: records.filter((r) => r.state === "queued").map(pick),
        done: records.filter((r) => r.state === "done").map(pick),
        reports: (snap.scout_reports || []).map((r) => r.id),
    };
}

async function fleetStatus() {
    const alive = await sessionAlive();
    let fleet = null;
    let view = "";
    try {
        const out = await run(join(FM_ROOT, "bin", "fm-fleet-snapshot.sh"), ["--json"], { env: ENV, cwd: FM_ROOT, timeout: 20000, maxBuffer: 8 * 1024 * 1024 });
        fleet = simplifyFleet(JSON.parse(out.stdout));
    } catch (e) {
        view = `fleet snapshot failed: ${e.message}`;
    }
    let windows = "";
    if (alive) {
        try {
            windows = (await run("tmux", ["list-windows", "-t", SESSION, "-F", "#{window_index}: #{window_name}"], { env: ENV })).stdout;
        } catch {}
    }
    return { alive, windows, fleet, view };
}

async function peekTask(id) {
    if (!ID_RE.test(id)) throw new Error("bad id");
    const out = await run(join(FM_ROOT, "bin", "fm-peek.sh"), [id, "40"], { env: ENV, cwd: FM_ROOT, timeout: 15000 });
    return out.stdout.split("\n").filter((l) => l.trim()).slice(-30).join("\n");
}

function readReport(id) {
    if (!ID_RE.test(id)) throw new Error("bad id");
    const p = join(FM_ROOT, "data", id, "report.md");
    if (!existsSync(p)) throw new Error("no report");
    return readFileSync(p, "utf8").slice(0, 20000);
}

async function paneTail() {
    if (!(await sessionAlive())) return "";
    try {
        return (await run("tmux", ["capture-pane", "-p", "-t", `${SESSION}:${WINDOW}`], { env: ENV })).stdout.split("\n").filter((l) => l.trim()).slice(-14).join("\n");
    } catch {
        return "";
    }
}

const PAGE = (token) => `<!doctype html><html><head><meta charset="utf-8"><title>Firstmate</title>
<style>
:root{--bg:#0a0c10;--panel:#0f131a;--bd:#262c36;--fg:#d6dde6;--mut:#7d8590;--pur:#a371f7;--pink:#f778ba;--cyan:#56d4dd;--grn:#3fb950;--red:#ff7b72}
*{box-sizing:border-box}
body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:13px/1.55 ui-monospace,SFMono-Regular,"SF Mono",Menlo,monospace}
.win{max-width:760px;margin:0 auto;border:1px solid var(--bd);border-radius:10px;background:var(--panel);overflow:hidden}
.bar{display:flex;align-items:center;gap:7px;padding:9px 12px;border-bottom:1px solid var(--bd);background:#0c1016}
.bar i{width:11px;height:11px;border-radius:50%;background:#30363d}.bar span{margin-left:8px;color:var(--mut);font-size:12px}
.pad{padding:16px 18px}
.logo{font-weight:700;font-size:15px;line-height:1.25;white-space:pre;background:linear-gradient(90deg,var(--pur),var(--pink) 55%,var(--cyan));-webkit-background-clip:text;background-clip:text;color:transparent;margin:0 0 4px}
.sub{color:var(--mut);margin:0 0 4px}
.st{display:inline-flex;align-items:center;gap:7px;margin-top:6px;color:var(--mut)}
.dot{width:8px;height:8px;border-radius:50%;background:#6e7681}.on{background:var(--grn);box-shadow:0 0 8px var(--grn)}
.sec{border-top:1px solid var(--bd);padding:14px 18px}
h2{margin:0 0 8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;color:var(--pur)}
h2:before{content:"\\25C6 ";color:var(--pink)}
label{display:block;margin:10px 0 4px;color:var(--mut);font-size:12px}
input,select,textarea{width:100%;background:#090b0f;color:var(--fg);border:1px solid var(--bd);border-radius:6px;padding:7px 10px;font:inherit}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--pur);box-shadow:0 0 0 2px rgba(163,113,247,.25)}
textarea{min-height:90px;resize:vertical}
.pr{position:relative}.pr:before{content:">";position:absolute;left:10px;top:7px;color:var(--pink);font-weight:700}.pr textarea{padding-left:26px}
.row{display:flex;gap:10px}.row>div{flex:1}
.act{display:flex;align-items:center;gap:12px;margin-top:12px}
button{padding:7px 16px;border-radius:6px;border:1px solid transparent;color:#fff;font:inherit;font-weight:700;cursor:pointer;background:linear-gradient(90deg,#8957e5,#d2459b);transition:filter .15s,transform .05s}
button:hover:not(:disabled){filter:brightness(1.15)}button:active:not(:disabled){transform:translateY(1px)}button:disabled{opacity:.5;cursor:default}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.chip{padding:2px 10px;border:1px solid var(--bd);border-radius:999px;font-size:12px;color:var(--mut)}.chip b{color:var(--fg)}
.chip.hot{border-color:var(--pur);color:var(--fg)}
.empty{color:var(--mut);padding:8px 0}
.task{border:1px solid var(--bd);border-radius:8px;padding:10px 12px;margin-bottom:8px;background:#0b0e13}
.task .top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.task .id{font-weight:700;color:var(--fg)}
.badge{padding:1px 8px;border-radius:999px;font-size:11px;font-weight:700;border:1px solid var(--bd);color:var(--mut)}
.badge.working,.badge.running,.badge.active{color:var(--cyan);border-color:var(--cyan)}
.badge.done,.badge.complete,.badge.merged,.badge.finished{color:var(--grn);border-color:var(--grn)}
.badge.blocked,.badge.failed,.badge.error,.badge.stuck{color:var(--red);border-color:var(--red)}
.badge.kind{color:var(--pur);border-color:var(--pur)}
.meta{color:var(--mut);font-size:12px;margin-top:4px}
.btns{display:flex;gap:8px;margin-top:8px}
.btn2{margin:0;padding:3px 10px;font-size:12px;font-weight:600;background:transparent;border:1px solid var(--bd);color:var(--fg)}
.btn2:hover:not(:disabled){border-color:var(--pur);filter:none}
.task pre{margin-top:8px;max-height:180px}
.raw summary{cursor:pointer;color:var(--mut);font-size:12px}.raw pre{margin-top:8px}
a{color:var(--cyan)}
kbd{color:var(--mut);font-size:11px}
#msg{color:var(--mut);font-size:12px}
pre{margin:0;padding:10px 12px;max-height:230px;overflow:auto;white-space:pre-wrap;background:#090b0f;border:1px solid var(--bd);border-left:2px solid var(--pur);border-radius:6px;font:12px/1.5 inherit;color:#b6c0cc}
</style></head><body>
<div class="win"><div class="bar"><i></i><i></i><i></i><span>copilot - firstmate</span></div>
<div class="pad"><div class="logo">GitHub Copilot CLI
firstmate console</div><p class="sub">Talk to one agent. Ship with a crew.</p>
<div class="st"><span id="dot" class="dot"></span><span id="alive">checking...</span></div></div>
<div class="sec"><h2>New task</h2>
<label for="project">project</label><input id="project" list="projects" placeholder="/path/to/repo"><datalist id="projects"></datalist>
<div class="row"><div><label for="kind">type</label><select id="kind"><option value="scout">scout - investigate, report</option><option value="ship">ship - change code</option></select></div>
<div><label for="mode">mode</label><select id="mode"><option>local-only</option><option>direct-PR</option><option>no-mistakes</option></select></div></div>
<label for="task">task</label><div class="pr"><textarea id="task" placeholder="Describe what you want in plain English"></textarea></div>
<div class="act"><button id="send">Send to first mate</button><span id="msg"></span></div></div>
<div class="sec"><h2>First mate (live)</h2><pre id="pane">-</pre></div>
<div class="sec"><h2>Fleet</h2><div id="chips" class="chips"></div><div id="fleet"><div class="empty">loading...</div></div></div>
<div class="sec" id="repsec" hidden><h2>Scout reports</h2><div id="reports"></div></div>
<details class="sec raw"><summary>raw status</summary><pre id="status">-</pre></details></div>
<script>
const T=${JSON.stringify(token)};
const $=id=>document.getElementById(id);
const H={"X-Token":T,"Content-Type":"application/json"};
fetch("/api/projects",{headers:H}).then(r=>r.json()).then(l=>{$("projects").innerHTML=l.map(p=>'<option value="'+p+'">').join("");if(!$("project").value&&l[0])$("project").value=l.find(p=>/just-play$/.test(p))||l[0]});
const esc=x=>String(x??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const open=new Set(), cache={};
async function api(p){return (await fetch(p,{headers:H})).json()}
function card(t){
 const o=open.has("p:"+t.id), r=open.has("r:"+t.id);
 return '<div class="task"><div class="top"><span class="id">'+esc(t.id)+'</span><span class="badge '+esc(String(t.state).toLowerCase())+'">'+esc(t.state)+'</span><span class="badge kind">'+esc(t.kind)+'</span></div>'
 +'<div class="meta">'+esc(t.project||"no project")+(t.backend?" - "+esc(t.backend):"")+(t.endpoint===false?" - endpoint gone":"")+(t.pr?' - <a href="'+esc(t.pr)+'" target="_blank">PR</a>':"")+'</div>'
 +'<div class="btns">'+(t.steerable?'<button class="btn2" data-k="p:'+esc(t.id)+'">'+(o?"Hide":"Peek")+'</button>':"")+(t.report?'<button class="btn2" data-k="r:'+esc(t.id)+'">'+(r?"Hide report":"Report")+'</button>':"")+'</div>'
 +(o?'<pre>'+esc(cache["p:"+t.id]||"loading...")+'</pre>':"")+(r?'<pre>'+esc(cache["r:"+t.id]||"loading...")+'</pre>':"")+'</div>';
}
function row(r){return '<div class="task"><div class="top"><span class="id">'+esc(r.title||r.id)+'</span>'+(r.kind?'<span class="badge kind">'+esc(r.kind)+'</span>':"")+(r.blocked?'<span class="badge blocked">blocked: '+esc(r.blocked)+'</span>':"")+'</div><div class="meta">'+esc(r.repo||"")+(r.pr?' - <a href="'+esc(r.pr)+'" target="_blank">PR</a>':"")+'</div></div>'}
let last=null;
function render(){
 const f=last&&last.fleet; if(!f){$("fleet").innerHTML='<div class="empty">fleet unavailable</div>';return}
 const live=f.tasks.filter(t=>!/^(done|complete|finished|merged)$/i.test(t.state));
 $("chips").innerHTML='<span class="chip'+(live.length?" hot":"")+'"><b>'+live.length+'</b> under way</span><span class="chip"><b>'+f.queued.length+'</b> queued</span><span class="chip"><b>'+(f.done.length+f.tasks.length-live.length)+'</b> done</span><span class="chip"><b>'+f.reports.length+'</b> reports</span>';
 let h=f.tasks.map(card).join("");
 if(f.queued.length)h+='<h2 style="margin-top:12px">Queued</h2>'+f.queued.map(row).join("");
 if(f.done.length)h+='<h2 style="margin-top:12px">Done</h2>'+f.done.map(row).join("");
 $("fleet").innerHTML=h||'<div class="empty">No tasks yet. Send one above and the first mate will spawn a crewmate.</div>';
 $("repsec").hidden=!f.reports.length;
 $("reports").innerHTML=f.reports.map(id=>'<div class="task"><div class="top"><span class="id">'+esc(id)+'</span></div><div class="btns"><button class="btn2" data-k="r:'+esc(id)+'">'+(open.has("r:"+id)?"Hide report":"Read report")+'</button></div>'+(open.has("r:"+id)?'<pre>'+esc(cache["r:"+id]||"loading...")+'</pre>':"")+'</div>').join("");
}
async function load(k){const [t,id]=[k[0],k.slice(2)];const j=await api("/api/"+(t==="p"?"peek":"report")+"?id="+encodeURIComponent(id)).catch(e=>({text:"error: "+e.message}));cache[k]=j.text||j.error||"";render()}
document.addEventListener("click",e=>{const k=e.target.dataset&&e.target.dataset.k;if(!k)return;if(open.has(k)){open.delete(k);render()}else{open.add(k);render();load(k)}});
async function refresh(){try{const s=await api("/api/status");last=s;$("dot").className="dot"+(s.alive?" on":"");$("alive").textContent=s.alive?"first mate running":"first mate idle - Send will start it";$("status").textContent=(s.windows?s.windows+"\n":"")+(s.view||"");$("pane").textContent=s.pane||"-";render();for(const k of open)if(k[0]==="p")load(k)}catch(e){}}
$("send").onclick=async()=>{$("send").disabled=true;$("msg").textContent="sending...";
try{const r=await fetch("/api/send",{method:"POST",headers:H,body:JSON.stringify({project:$("project").value,kind:$("kind").value,mode:$("mode").value,task:$("task").value})});const j=await r.json();$("msg").textContent=r.ok?"sent"+(j.startedSession?" (started first mate)":""):"error: "+j.error;if(r.ok)$("task").value=""}catch(e){$("msg").textContent="error: "+e.message}
$("send").disabled=false;refresh()};
refresh();setInterval(refresh,2000);
</script></body></html>`;

export async function startServer() {
    const token = randomBytes(24).toString("hex");
    const server = createServer(async (req, res) => {
        const json = (code, body) => {
            res.writeHead(code, { "Content-Type": "application/json" });
            res.end(JSON.stringify(body));
        };
        const url = new URL(req.url, "http://x");
        if (url.pathname === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            return res.end(PAGE(token));
        }
        if (req.headers["x-token"] !== token) return json(403, { error: "forbidden" });
        try {
            if (url.pathname === "/api/projects") return json(200, candidateProjects());
            if (url.pathname === "/api/status") {
                const s = await fleetStatus();
                s.pane = await paneTail();
                return json(200, s);
            }
            if (url.pathname === "/api/peek") {
                const text = await peekTask(url.searchParams.get("id") ?? "").catch((e) => `(peek unavailable: ${e.message.split("\n")[0]})`);
                return json(200, { text });
            }
            if (url.pathname === "/api/report") return json(200, { text: readReport(url.searchParams.get("id") ?? "") });
            if (url.pathname === "/api/send" && req.method === "POST") {
                let body = "";
                for await (const chunk of req) {
                    body += chunk;
                    if (body.length > 10000) return json(413, { error: "too large" });
                }
                return json(200, await sendToFirstMate(buildMessage(JSON.parse(body))));
            }
            return json(404, { error: "not found" });
        } catch (e) {
            return json(400, { error: e.message });
        }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

export { fleetStatus, sendToFirstMate };
