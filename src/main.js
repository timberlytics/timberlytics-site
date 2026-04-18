import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const runtimeEnv = import.meta.env ?? {};
const SUPABASE_URL = runtimeEnv.VITE_SUPABASE_URL || "https://cbikuhcqbrhdfxvczrrq.supabase.co";
const SUPABASE_ANON_KEY = runtimeEnv.VITE_SUPABASE_ANON_KEY || "sb_publishable_hVpf9RO37koRtA4hDLCd4A_ygC1OOqs";

const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_URL.includes("your-project-ref"));
const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const app = document.querySelector("#app");

let session = null;
let projects = [];
let activeId = null;
let loading = true;
let authMode = "signin";
let authMessage = "";
let authError = "";
let mfaChallenge = null;
let mfaEnrollment = null;
let mfaFactors = [];
let search = "";

const emptyProject = userId => ({
  name: "New woodworking build",
  source_url: "",
  status: "Idea",
  estimated_hours: 0,
  actual_hours: 0,
  hourly_rate: 35,
  markup_percent: 25,
  notes: "",
  user_id: userId
});

const emptyMaterial = (projectId, userId) => ({
  project_id: projectId,
  user_id: userId,
  name: "",
  category: "",
  qty: 1,
  unit: "",
  unit_cost: 0,
  source: ""
});

const emptyCut = (projectId, userId) => ({
  project_id: projectId,
  user_id: userId,
  part: "",
  material: "",
  qty: 1,
  length: "",
  width: "",
  thickness: "",
  notes: ""
});

async function boot() {
  if (!configured) {
    loading = false;
    render();
    return;
  }

  const { data } = await supabase.auth.getSession();
  session = data.session;
  supabase.auth.onAuthStateChange(async (_event, nextSession) => {
    session = nextSession;
    if (session) {
      await refreshMfaState();
      await loadProjects();
    } else {
      projects = [];
      activeId = null;
      mfaChallenge = null;
      mfaEnrollment = null;
      mfaFactors = [];
      render();
    }
  });

  if (session) {
    await refreshMfaState();
    await loadProjects();
  }
  loading = false;
  render();
}

async function refreshMfaState() {
  if (!session) return;
  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const { data: factorsData } = await supabase.auth.mfa.listFactors();
  mfaFactors = factorsData?.totp ?? [];

  if (aalData?.currentLevel !== aalData?.nextLevel) {
    const factor = mfaFactors.find(item => item.status === "verified");
    if (factor) {
      const { data, error } = await supabase.auth.mfa.challenge({ factorId: factor.id });
      if (!error) {
        mfaChallenge = { factorId: factor.id, challengeId: data.id };
      }
    }
  } else {
    mfaChallenge = null;
  }
}

async function loadProjects() {
  const { data, error } = await supabase
    .from("projects")
    .select("*, materials(*), cuts(*)")
    .eq("user_id", session.user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    authError = error.message;
    render();
    return;
  }

  projects = (data ?? []).map(project => ({
    ...project,
    materials: project.materials ?? [],
    cuts: project.cuts ?? []
  }));

  if (!activeId && projects[0]) activeId = projects[0].id;
  if (!projects.find(project => project.id === activeId)) activeId = projects[0]?.id ?? null;
  render();
}

function activeProject() {
  return projects.find(project => project.id === activeId) ?? projects[0] ?? null;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function materialTotal(material) {
  return toNumber(material.qty) * toNumber(material.unit_cost);
}

function totals(project) {
  if (!project) return { materials: 0, labor: 0, baseCost: 0, suggested: 0, profit: 0 };
  const materials = project.materials.reduce((sum, material) => sum + materialTotal(material), 0);
  const hours = toNumber(project.actual_hours) || toNumber(project.estimated_hours);
  const labor = hours * toNumber(project.hourly_rate);
  const baseCost = materials + labor;
  const suggested = baseCost * (1 + toNumber(project.markup_percent) / 100);
  return { materials, labor, baseCost, suggested, profit: suggested - baseCost };
}

function render() {
  if (loading) {
    app.innerHTML = `<main class="loading-screen"><div class="brand-mark">T</div><h1>Loading Timberlytics</h1></main>`;
    return;
  }

  if (!configured) {
    app.innerHTML = configScreen();
    return;
  }

  if (!session) {
    app.innerHTML = authScreen();
    bindAuth();
    return;
  }

  if (mfaChallenge) {
    app.innerHTML = mfaChallengeScreen();
    bindMfaChallenge();
    return;
  }

  app.innerHTML = dashboardScreen();
  bindDashboard();
}

function configScreen() {
  return `
    <main class="auth-layout compact-auth">
      <section class="auth-card">
        <div class="brand">
          <div class="brand-mark">T</div>
          <div><p class="eyebrow">Setup needed</p><h1>Connect Supabase</h1></div>
        </div>
        <p class="auth-copy">Create a <code>.env</code> file from <code>.env.example</code>, add your Supabase URL and anon key, run the SQL migration, then start the app.</p>
        <pre>VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key</pre>
      </section>
    </main>
  `;
}

function authScreen() {
  const isSignUp = authMode === "signup";
  return `
    <main class="auth-layout">
      <section class="auth-art">
        <img src="https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=1400&q=80" alt="Woodworking bench with hand tools">
        <div>
          <p class="eyebrow">Timberlytics</p>
          <h1>Quote sharper. Build cleaner. Keep your shop math locked down.</h1>
        </div>
      </section>
      <section class="auth-card">
        <div class="brand">
          <div class="brand-mark">T</div>
          <div><p class="eyebrow">${isSignUp ? "Create account" : "Welcome back"}</p><h2>${isSignUp ? "Start your shop notebook" : "Sign in to Timberlytics"}</h2></div>
        </div>
        ${authMessage ? `<p class="success-message">${escapeHtml(authMessage)}</p>` : ""}
        ${authError ? `<p class="error-message">${escapeHtml(authError)}</p>` : ""}
        <form id="authForm" class="auth-form">
          <label>Email <input class="input" name="email" type="email" autocomplete="email" required></label>
          <label>Password <input class="input" name="password" type="password" autocomplete="${isSignUp ? "new-password" : "current-password"}" minlength="8" required></label>
          <button class="primary-btn full" type="submit">${isSignUp ? "Create secure account" : "Sign in"}</button>
        </form>
        <button id="switchAuthBtn" class="link-btn" type="button">${isSignUp ? "Already have an account? Sign in" : "Need an account? Create one"}</button>
        <button id="resetPasswordBtn" class="link-btn" type="button">Send password reset email</button>
      </section>
    </main>
  `;
}

function mfaChallengeScreen() {
  return `
    <main class="auth-layout compact-auth">
      <section class="auth-card">
        <div class="brand">
          <div class="brand-mark">T</div>
          <div><p class="eyebrow">Two-factor check</p><h1>Enter your authenticator code</h1></div>
        </div>
        ${authError ? `<p class="error-message">${escapeHtml(authError)}</p>` : ""}
        <form id="mfaChallengeForm" class="auth-form">
          <label>Six-digit code <input class="input" name="code" inputmode="numeric" autocomplete="one-time-code" required></label>
          <button class="primary-btn full" type="submit">Verify and continue</button>
        </form>
        <button id="signOutBtn" class="link-btn" type="button">Sign out</button>
      </section>
    </main>
  `;
}

function dashboardScreen() {
  const project = activeProject();
  const summary = totals(project);
  const filtered = projects.filter(item => `${item.name} ${item.source_url} ${item.notes}`.toLowerCase().includes(search.toLowerCase()));

  return `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">T</div>
          <div><p class="eyebrow">Timberlytics</p><h1>Build Planner</h1></div>
        </div>
        <button id="newProjectBtn" class="primary-btn full">New build</button>
        <label class="search-label">Find a build <input id="projectSearch" class="input" type="search" value="${escapeAttr(search)}" placeholder="Search projects, videos, notes"></label>
        <div class="project-list">${filtered.map(projectCard).join("")}</div>
        <section class="account-panel">
          <p class="eyebrow">Account</p>
          <strong>${escapeHtml(session.user.email)}</strong>
          <span>${mfaFactors.some(factor => factor.status === "verified") ? "2FA enabled" : "2FA not enabled"}</span>
          <button id="mfaEnrollBtn" class="ghost-btn full" type="button">Set up 2FA</button>
          <button id="signOutBtn" class="danger-btn full" type="button">Sign out</button>
        </section>
      </aside>
      <main class="workspace">
        <section class="topbar">
          <div><p class="eyebrow">Plan, price, build, repeat</p><h2>${escapeHtml(project?.name ?? "No builds yet")}</h2></div>
          <div class="top-actions">
            <button id="printBtn" class="ghost-btn">Print cut list</button>
            <button id="docBtn" class="primary-btn">Export Word doc</button>
          </div>
        </section>
        ${mfaEnrollment ? mfaEnrollPanel() : ""}
        ${project ? projectWorkspace(project, summary) : emptyState()}
      </main>
    </div>
  `;
}

function projectCard(project) {
  return `
    <button class="project-card ${project.id === activeId ? "active" : ""}" data-project-id="${project.id}" type="button">
      <strong>${escapeHtml(project.name || "Untitled build")}</strong>
      <span>${escapeHtml(project.status)} | ${currency.format(totals(project).suggested)}</span>
    </button>
  `;
}

function mfaEnrollPanel() {
  const qr = mfaEnrollment.totp?.qr_code ?? "";
  const factorId = mfaEnrollment.id;
  const src = qr.startsWith("data:") ? qr : `data:image/svg+xml;utf8,${encodeURIComponent(qr)}`;
  return `
    <section class="panel mfa-panel">
      <div>
        <p class="eyebrow">Authenticator app</p>
        <h3>Scan this QR code</h3>
        <p class="helper-text">Use 1Password, Google Authenticator, Microsoft Authenticator, Authy, or another TOTP app.</p>
      </div>
      <img class="qr-code" src="${src}" alt="Authenticator QR code">
      <form id="mfaEnrollForm" class="inline-form" data-factor-id="${factorId}">
        <input class="input" name="code" inputmode="numeric" autocomplete="one-time-code" placeholder="Six-digit code" required>
        <button class="primary-btn" type="submit">Enable 2FA</button>
        <button id="cancelMfaEnrollBtn" class="ghost-btn" type="button">Cancel</button>
      </form>
    </section>
  `;
}

function emptyState() {
  return `
    <section class="panel empty-state">
      <h3>No builds yet</h3>
      <p>Create your first woodworking build and Timberlytics will track the materials, cuts, hours, and quote math under your account.</p>
      <button id="emptyNewProjectBtn" class="primary-btn">Create first build</button>
    </section>
  `;
}

function projectWorkspace(project, summary) {
  return `
    <section class="hero-strip">
      <img src="https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=1400&q=80" alt="Woodworking bench with hand tools">
      <div class="hero-copy"><p class="eyebrow">From video idea to priced job</p><strong>Capture what the creator says, fill the gaps, and walk into the shop with a clean cut list.</strong></div>
    </section>
    <section class="stats-grid">
      <article class="stat-card"><span>Materials</span><strong>${currency.format(summary.materials)}</strong></article>
      <article class="stat-card"><span>Labor value</span><strong>${currency.format(summary.labor)}</strong></article>
      <article class="stat-card"><span>Estimated cost</span><strong>${currency.format(summary.baseCost)}</strong></article>
      <article class="stat-card accent"><span>Suggested price</span><strong>${currency.format(summary.suggested)}</strong></article>
    </section>
    <section class="editor-grid">
      <form id="projectForm" class="panel project-form" data-id="${project.id}">
        <div class="panel-heading">
          <div><p class="eyebrow">Build brief</p><h3>Project details</h3></div>
          <select class="input compact" name="status">${["Idea", "Pricing", "In shop", "Finished", "Sold"].map(status => `<option ${status === project.status ? "selected" : ""}>${status}</option>`).join("")}</select>
        </div>
        <div class="field-grid">
          ${field("Project name", "name", project.name)}
          ${field("YouTube or plan link", "source_url", project.source_url, "url")}
          ${field("Estimated build hours", "estimated_hours", project.estimated_hours, "number", "0.25")}
          ${field("Actual build hours", "actual_hours", project.actual_hours, "number", "0.25")}
          ${field("Hourly shop rate", "hourly_rate", project.hourly_rate, "number", "1")}
          ${field("Markup percent", "markup_percent", project.markup_percent, "number", "1")}
        </div>
        <label>Build notes while watching<textarea class="input" name="notes" rows="7" placeholder="Timestamp notes, joinery, finish, tools, measurements mentioned in the video...">${escapeHtml(project.notes ?? "")}</textarea></label>
      </form>
      <section class="panel quick-panel">
        <div><p class="eyebrow">Selling math</p><h3>Quote helper</h3></div>
        <div class="quote-box">
          <div><span>Profit at suggested price</span><strong>${currency.format(summary.profit)}</strong></div>
          <div><span>Cut pieces</span><strong>${project.cuts.reduce((sum, cut) => sum + toNumber(cut.qty), 0)}</strong></div>
          <div><span>Materials logged</span><strong>${project.materials.length}</strong></div>
        </div>
        <p class="helper-text">Markup is applied after materials and labor, so quick quotes include your time.</p>
        <button id="deleteProjectBtn" class="danger-btn full" type="button">Delete this build</button>
      </section>
    </section>
    ${materialsPanel(project)}
    ${cutsPanel(project)}
  `;
}

function field(label, name, value, type = "text", step = "") {
  return `<label>${label}<input class="input" name="${name}" type="${type}" ${step ? `step="${step}"` : ""} min="0" value="${escapeAttr(value ?? "")}"></label>`;
}

function materialsPanel(project) {
  return `
    <section class="panel">
      <div class="panel-heading"><div><p class="eyebrow">What to buy</p><h3>Materials and costs</h3></div><button id="addMaterialBtn" class="ghost-btn" type="button">Add material</button></div>
      <div class="table-wrap"><table><thead><tr><th>Item</th><th>Category</th><th>Qty</th><th>Unit</th><th>Unit cost</th><th>Total</th><th>Source</th><th></th></tr></thead><tbody>
        ${project.materials.map(materialRow).join("")}
      </tbody></table></div>
    </section>
  `;
}

function materialRow(material) {
  return `
    <tr data-material-id="${material.id}">
      ${cell("name", material.name, "2x4 select pine")}
      ${cell("category", material.category, "Lumber")}
      ${cell("qty", material.qty, "", "number", "0.01")}
      ${cell("unit", material.unit, "board")}
      ${cell("unit_cost", material.unit_cost, "", "number", "0.01")}
      <td class="row-total">${currency.format(materialTotal(material))}</td>
      ${cell("source", material.source, "Lowes")}
      <td><button class="icon-btn" data-remove-material="${material.id}" type="button">x</button></td>
    </tr>
  `;
}

function cutsPanel(project) {
  return `
    <section class="panel">
      <div class="panel-heading"><div><p class="eyebrow">What to cut</p><h3>Cut list generator</h3></div><button id="addCutBtn" class="ghost-btn" type="button">Add cut</button></div>
      <div class="table-wrap"><table><thead><tr><th>Part</th><th>Material</th><th>Qty</th><th>Length</th><th>Width</th><th>Thick</th><th>Notes</th><th></th></tr></thead><tbody>
        ${project.cuts.map(cutRow).join("")}
      </tbody></table></div>
    </section>
  `;
}

function cutRow(cut) {
  return `
    <tr data-cut-id="${cut.id}">
      ${cell("part", cut.part, "Side panel")}
      ${cell("material", cut.material, "3/4 plywood")}
      ${cell("qty", cut.qty, "", "number", "1")}
      ${cell("length", cut.length, "24 in")}
      ${cell("width", cut.width, "12 in")}
      ${cell("thickness", cut.thickness, "3/4 in")}
      ${cell("notes", cut.notes, "Label A")}
      <td><button class="icon-btn" data-remove-cut="${cut.id}" type="button">x</button></td>
    </tr>
  `;
}

function cell(name, value, placeholder, type = "text", step = "") {
  return `<td><input class="cell-input ${type === "number" ? "number" : ""}" name="${name}" type="${type}" ${step ? `step="${step}"` : ""} min="0" value="${escapeAttr(value ?? "")}" placeholder="${escapeAttr(placeholder)}"></td>`;
}

function bindAuth() {
  document.querySelector("#switchAuthBtn").addEventListener("click", () => {
    authMode = authMode === "signin" ? "signup" : "signin";
    authError = "";
    authMessage = "";
    render();
  });

  document.querySelector("#resetPasswordBtn").addEventListener("click", async () => {
    const email = document.querySelector("input[name='email']").value;
    if (!email) {
      authError = "Enter your email first, then hit reset.";
      render();
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    authError = error?.message ?? "";
    authMessage = error ? "" : "Password reset email sent.";
    render();
  });

  document.querySelector("#authForm").addEventListener("submit", async event => {
    event.preventDefault();
    authError = "";
    authMessage = "";
    const form = new FormData(event.currentTarget);
    const email = form.get("email");
    const password = form.get("password");
    const response = authMode === "signup"
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    if (response.error) {
      authError = response.error.message;
      render();
      return;
    }

    if (authMode === "signup" && !response.data.session) {
      authMessage = "Check your email to confirm the account, then sign in.";
      authMode = "signin";
      render();
    }
  });
}

function bindMfaChallenge() {
  document.querySelector("#mfaChallengeForm").addEventListener("submit", async event => {
    event.preventDefault();
    const code = new FormData(event.currentTarget).get("code");
    const { error } = await supabase.auth.mfa.verify({
      factorId: mfaChallenge.factorId,
      challengeId: mfaChallenge.challengeId,
      code
    });
    authError = error?.message ?? "";
    if (!error) {
      mfaChallenge = null;
      await loadProjects();
    } else {
      render();
    }
  });
  document.querySelector("#signOutBtn").addEventListener("click", () => supabase.auth.signOut());
}

function bindDashboard() {
  document.querySelectorAll("[data-project-id]").forEach(button => {
    button.addEventListener("click", () => {
      activeId = button.dataset.projectId;
      render();
    });
  });

  document.querySelector("#projectSearch").addEventListener("input", event => {
    search = event.target.value;
    render();
  });

  document.querySelector("#newProjectBtn")?.addEventListener("click", createProject);
  document.querySelector("#emptyNewProjectBtn")?.addEventListener("click", createProject);
  document.querySelector("#signOutBtn").addEventListener("click", () => supabase.auth.signOut());
  document.querySelector("#printBtn")?.addEventListener("click", () => window.print());
  document.querySelector("#docBtn")?.addEventListener("click", exportDoc);
  document.querySelector("#mfaEnrollBtn").addEventListener("click", startMfaEnrollment);
  document.querySelector("#cancelMfaEnrollBtn")?.addEventListener("click", () => {
    mfaEnrollment = null;
    render();
  });
  document.querySelector("#mfaEnrollForm")?.addEventListener("submit", verifyMfaEnrollment);
  document.querySelector("#deleteProjectBtn")?.addEventListener("click", deleteProject);
  document.querySelector("#addMaterialBtn")?.addEventListener("click", addMaterial);
  document.querySelector("#addCutBtn")?.addEventListener("click", addCut);

  document.querySelector("#projectForm")?.addEventListener("input", debounceProjectUpdate);
  document.querySelectorAll("[data-material-id] input").forEach(input => {
    input.addEventListener("change", () => updateLine("materials", input.closest("tr").dataset.materialId, input.name, input.value));
  });
  document.querySelectorAll("[data-cut-id] input").forEach(input => {
    input.addEventListener("change", () => updateLine("cuts", input.closest("tr").dataset.cutId, input.name, input.value));
  });
  document.querySelectorAll("[data-remove-material]").forEach(button => button.addEventListener("click", () => removeLine("materials", button.dataset.removeMaterial)));
  document.querySelectorAll("[data-remove-cut]").forEach(button => button.addEventListener("click", () => removeLine("cuts", button.dataset.removeCut)));
}

let projectTimer = null;
function debounceProjectUpdate(event) {
  const form = event.currentTarget;
  const project = activeProject();
  const data = Object.fromEntries(new FormData(form));
  for (const key of ["estimated_hours", "actual_hours", "hourly_rate", "markup_percent"]) data[key] = toNumber(data[key]);
  Object.assign(project, data);
  clearTimeout(projectTimer);
  projectTimer = setTimeout(async () => {
    const payload = {
      name: project.name,
      source_url: project.source_url,
      status: project.status,
      estimated_hours: project.estimated_hours,
      actual_hours: project.actual_hours,
      hourly_rate: project.hourly_rate,
      markup_percent: project.markup_percent,
      notes: project.notes
    };
    await supabase.from("projects").update(payload).eq("id", project.id).eq("user_id", session.user.id);
    await loadProjects();
  }, 350);
}

async function createProject() {
  const { data, error } = await supabase.from("projects").insert(emptyProject(session.user.id)).select().single();
  if (!error) {
    activeId = data.id;
    await supabase.from("materials").insert({ ...emptyMaterial(data.id, session.user.id), name: "Plywood sheet", category: "Sheet goods", unit: "sheet" });
    await supabase.from("cuts").insert({ ...emptyCut(data.id, session.user.id), part: "Top", material: "Plywood" });
    await loadProjects();
  }
}

async function deleteProject() {
  const project = activeProject();
  if (!project) return;
  await supabase.from("projects").delete().eq("id", project.id).eq("user_id", session.user.id);
  activeId = null;
  await loadProjects();
}

async function addMaterial() {
  const project = activeProject();
  await supabase.from("materials").insert(emptyMaterial(project.id, session.user.id));
  await loadProjects();
}

async function addCut() {
  const project = activeProject();
  await supabase.from("cuts").insert(emptyCut(project.id, session.user.id));
  await loadProjects();
}

async function updateLine(table, id, field, value) {
  const numeric = ["qty", "unit_cost"].includes(field);
  await supabase.from(table).update({ [field]: numeric ? toNumber(value) : value }).eq("id", id).eq("user_id", session.user.id);
  await loadProjects();
}

async function removeLine(table, id) {
  await supabase.from(table).delete().eq("id", id).eq("user_id", session.user.id);
  await loadProjects();
}

async function startMfaEnrollment() {
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
  authError = error?.message ?? "";
  mfaEnrollment = error ? null : data;
  render();
}

async function verifyMfaEnrollment(event) {
  event.preventDefault();
  const code = new FormData(event.currentTarget).get("code");
  const factorId = event.currentTarget.dataset.factorId;
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  authError = error?.message ?? "";
  if (!error) {
    mfaEnrollment = null;
    await refreshMfaState();
  }
  render();
}

function exportDoc() {
  const project = activeProject();
  if (!project) return;
  const summary = totals(project);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(project.name)} Cut List</title><style>body{font-family:Arial,sans-serif;color:#1b1b1b}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{border:1px solid #bbb;padding:7px;text-align:left}th{background:#eee}</style></head><body>
    <h1>${escapeHtml(project.name || "Untitled build")}</h1>
    <p><strong>Status:</strong> ${escapeHtml(project.status)}<br><strong>Source:</strong> ${escapeHtml(project.source_url || "Not listed")}</p>
    <p><strong>Materials:</strong> ${currency.format(summary.materials)}<br><strong>Labor:</strong> ${currency.format(summary.labor)}<br><strong>Estimated cost:</strong> ${currency.format(summary.baseCost)}<br><strong>Suggested price:</strong> ${currency.format(summary.suggested)}</p>
    <h2>Cut List</h2>${cutListTable(project)}
    <h2>Materials</h2>${materialsTable(project)}
    <h2>Build Notes</h2><p>${escapeHtml(project.notes || "").replace(/\n/g, "<br>")}</p>
  </body></html>`;
  downloadFile(`${safeFilename(project.name || "timberlytics-cut-list")}-${new Date().toISOString().slice(0, 10)}.doc`, html, "application/msword");
}

function cutListTable(project) {
  const rows = project.cuts.map(cut => `<tr><td>${escapeHtml(cut.part)}</td><td>${escapeHtml(cut.material)}</td><td>${escapeHtml(cut.qty)}</td><td>${escapeHtml(cut.length)}</td><td>${escapeHtml(cut.width)}</td><td>${escapeHtml(cut.thickness)}</td><td>${escapeHtml(cut.notes)}</td></tr>`).join("");
  return `<table><thead><tr><th>Part</th><th>Material</th><th>Qty</th><th>Length</th><th>Width</th><th>Thick</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function materialsTable(project) {
  const rows = project.materials.map(material => `<tr><td>${escapeHtml(material.name)}</td><td>${escapeHtml(material.category)}</td><td>${escapeHtml(material.qty)}</td><td>${escapeHtml(material.unit)}</td><td>${currency.format(toNumber(material.unit_cost))}</td><td>${currency.format(materialTotal(material))}</td><td>${escapeHtml(material.source)}</td></tr>`).join("");
  return `<table><thead><tr><th>Item</th><th>Category</th><th>Qty</th><th>Unit</th><th>Unit cost</th><th>Total</th><th>Source</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function downloadFile(filename, contents, type) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function safeFilename(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "timberlytics";
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("\n", " ");
}

boot();
