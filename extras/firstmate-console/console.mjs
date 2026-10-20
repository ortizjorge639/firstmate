import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import { readdirSync, statSync, existsSync } from "node:fs";
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

async function fleetStatus() {
    const alive = await sessionAlive();
    let view = "";
    try {
        view = (await run(join(FM_ROOT, "bin", "fm-fleet-view.sh"), [], { env: ENV, cwd: FM_ROOT, timeout: 20000 })).stdout;
    } catch (e) {
        view = `fleet view failed: ${e.message}`;
    }
    let windows = "";
    if (alive) {
        try {
            windows = (await run("tmux", ["list-windows", "-t", SESSION, "-F", "#{window_index}: #{window_name}"], { env: ENV })).stdout;
        } catch {}
    }
    return { alive, windows, view };
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
:root{--bg:#0d1117;--card:#161b22;--bd:#30363d;--fg:#e6edf3;--mut:#8b949e;--grn:#238636;--grn2:#2ea043;--pur:#a371f7;--blu:#58a6ff}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
.hero{position:relative;overflow:hidden;padding:34px 22px 26px;text-align:center;border-bottom:1px solid var(--bd);background:radial-gradient(60% 120% at 20% 0%,rgba(163,113,247,.35),transparent 60%),radial-gradient(60% 120% at 85% 10%,rgba(88,166,255,.30),transparent 60%),var(--bg)}
.hero h1{margin:0;font-size:30px;line-height:1.15;letter-spacing:-.02em;font-weight:700;background:linear-gradient(90deg,#fff,#c9b6ff 55%,#79c0ff);-webkit-background-clip:text;background-clip:text;color:transparent}
.hero p{margin:8px auto 0;max-width:420px;color:var(--mut);font-size:14px}
.pill{display:inline-flex;align-items:center;gap:7px;margin-bottom:12px;padding:3px 12px;border:1px solid var(--bd);border-radius:999px;background:rgba(22,27,34,.7);font-size:12px;color:var(--mut)}
.dot{width:8px;height:8px;border-radius:50%;background:#6e7681}.on{background:#3fb950;box-shadow:0 0 8px #3fb950}
main{padding:18px 18px 28px;max-width:720px;margin:0 auto}
.card{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:16px;margin-bottom:16px}
h2{margin:0 0 10px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--mut)}
label{display:block;margin:10px 0 4px;font-size:12px;font-weight:600;color:var(--fg)}
input,select,textarea{width:100%;background:var(--bg);color:var(--fg);border:1px solid var(--bd);border-radius:6px;padding:7px 10px;font:inherit}
input:focus,select:focus,textarea:focus{outline:2px solid var(--blu);outline-offset:-1px;border-color:var(--blu)}
textarea{min-height:90px;resize:vertical}
.row{display:flex;gap:10px}.row>div{flex:1}
.act{display:flex;align-items:center;gap:12px;margin-top:14px}
button{padding:7px 18px;border-radius:6px;border:1px solid rgba(240,246,252,.1);background:var(--grn);color:#fff;font:inherit;font-weight:600;cursor:pointer;transition:background .15s,transform .05s}
button:hover:not(:disabled){background:var(--grn2)}button:active:not(:disabled){transform:translateY(1px)}button:disabled{opacity:.5;cursor:default}
#msg{font-size:12px;color:var(--mut)}
pre{margin:0;padding:12px;max-height:230px;overflow:auto;white-space:pre-wrap;background:var(--bg);border:1px solid var(--bd);border-radius:6px;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;color:#c9d1d9}
</style></head><body>
<header class="hero"><div class="pill"><span id="dot" class="dot"></span><span id="alive">checking...</span></div>
<h1>Talk to one agent.<br>Ship with a crew.</h1><p>Send a scout or ship task to your first mate and watch the fleet work.</p></header>
<main>
<section class="card"><h2>New task</h2>
<label for="project">Project</label><input id="project" list="projects" placeholder="/path/to/repo"><datalist id="projects"></datalist>
<div class="row"><div><label for="kind">Task type</label><select id="kind"><option value="scout">Scout (investigate, report)</option><option value="ship">Ship (change code)</option></select></div>
<div><label for="mode">Mode</label><select id="mode"><option>local-only</option><option>direct-PR</option><option>no-mistakes</option></select></div></div>
<label for="task">Task</label><textarea id="task" placeholder="Describe what you want in plain English"></textarea>
<div class="act"><button id="send">Send to first mate</button><span id="msg"></span></div></section>
<section class="card"><h2>First mate (live)</h2><pre id="pane">-</pre></section>
<section class="card"><h2>Fleet status</h2><pre id="status">loading...</pre></section>
</main>
<script>
const T=${JSON.stringify(token)};
const $=id=>document.getElementById(id);
const H={"X-Token":T,"Content-Type":"application/json"};
fetch("/api/projects",{headers:H}).then(r=>r.json()).then(l=>{$("projects").innerHTML=l.map(p=>'<option value="'+p+'">').join("");if(!$("project").value&&l[0])$("project").value=l.find(p=>/just-play$/.test(p))||l[0]});
async function refresh(){try{const s=await (await fetch("/api/status",{headers:H})).json();$("dot").className="dot"+(s.alive?" on":"");$("alive").textContent=s.alive?"First mate running":"First mate idle - Send will start it";$("status").textContent=(s.windows?s.windows+"\\n":"")+s.view;$("pane").textContent=s.pane||"-"}catch(e){}}
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
