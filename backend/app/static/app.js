const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const saveBtn = document.getElementById('saveBtn');
const addBlockBtn = document.getElementById('addBlockBtn');
const resetBtn = document.getElementById('resetBtn');
const loadProjectBtn = document.getElementById('loadProjectBtn');
const refreshProjectsBtn = document.getElementById('refreshProjectsBtn');
const projectIdInput = document.getElementById('projectIdInput');
const searchInput = document.getElementById('searchInput');
const showOnlyEdited = document.getElementById('showOnlyEdited');
const darkModeToggle = document.getElementById('darkModeToggle');
const statusEl = document.getElementById('status');
const blocksEl = document.getElementById('blocks');
const blockCountEl = document.getElementById('blockCount');
const previewEl = document.getElementById('preview');
const projectListEl = document.getElementById('projectList');

let currentProjectId = null;
let blocks = [];
let originalBlocks = [];

const escapeHtml = (value) => (value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const clone = (value) => JSON.parse(JSON.stringify(value));

const setStatus = (msg) => {
  statusEl.textContent = msg;
};

const saveEnabled = (enabled) => {
  saveBtn.disabled = !enabled;
  addBlockBtn.disabled = !enabled;
  resetBtn.disabled = !enabled;
};

const isEdited = (index) => JSON.stringify(blocks[index]) !== JSON.stringify(originalBlocks[index]);

const renderBlocks = () => {
  const query = searchInput.value.trim().toLowerCase();
  const onlyEdited = showOnlyEdited.checked;
  blocksEl.innerHTML = '';

  let visibleCount = 0;

  blocks.forEach((block, idx) => {
    const matchesSearch = !query || (block.text || '').toLowerCase().includes(query);
    const changed = isEdited(idx);
    if (!matchesSearch || (onlyEdited && !changed)) {
      return;
    }

    visibleCount += 1;
    const wrapper = document.createElement('div');
    wrapper.className = `block ${changed ? 'edited' : ''}`;

    wrapper.innerHTML = `
      <div class="block-head">
        <strong>Block #${idx + 1}</strong>
        <div class="actions">
          <button data-action="duplicate" data-idx="${idx}">Duplicate</button>
          <button data-action="delete" data-idx="${idx}" class="danger">Delete</button>
        </div>
      </div>
      <label>Text</label>
      <textarea data-idx="${idx}" data-key="text" rows="2">${escapeHtml(block.text)}</textarea>
      <div class="row two-col">
        <div>
          <label>Font family</label>
          <input data-idx="${idx}" data-key="font_family" value="${escapeHtml(block.font_family || 'Arial')}" />
        </div>
        <div>
          <label>Font size</label>
          <input data-idx="${idx}" data-key="font_size" type="number" min="8" value="${block.font_size || 18}" />
        </div>
      </div>
      <div class="row two-col">
        <div>
          <label>Color</label>
          <input data-idx="${idx}" data-key="color" type="color" value="${block.color || '#111111'}" />
        </div>
        <div>
          <label>Page</label>
          <input data-idx="${idx}" data-key="page" type="number" min="1" value="${block.page || 1}" />
        </div>
      </div>
      <small>Position x:${Math.round(block.x)} y:${Math.round(block.y)} w:${Math.round(block.w)} h:${Math.round(block.h)}</small>
    `;

    blocksEl.appendChild(wrapper);
  });

  blockCountEl.textContent = `${visibleCount} visible / ${blocks.length} total`;

  blocksEl.querySelectorAll('input, textarea').forEach((input) => {
    input.addEventListener('input', (e) => {
      const idx = Number(e.target.dataset.idx);
      const key = e.target.dataset.key;
      const numericFields = ['font_size', 'page'];
      blocks[idx][key] = numericFields.includes(key) ? Number(e.target.value) : e.target.value;
      renderBlocks();
    });
  });

  blocksEl.querySelectorAll('button[data-action]').forEach((button) => {
    button.addEventListener('click', (event) => {
      const idx = Number(event.target.dataset.idx);
      const action = event.target.dataset.action;
      if (action === 'delete') {
        blocks.splice(idx, 1);
        originalBlocks.splice(idx, 1);
      }
      if (action === 'duplicate') {
        const copy = clone(blocks[idx]);
        copy.id = crypto.randomUUID();
        copy.y = Number(copy.y || 0) + 20;
        blocks.splice(idx + 1, 0, copy);
        originalBlocks.splice(idx + 1, 0, clone(copy));
      }
      renderBlocks();
    });
  });
};

const renderProjects = async () => {
  projectListEl.innerHTML = '<small>Loading...</small>';
  const res = await fetch('/api/projects');
  const data = await res.json();
  projectListEl.innerHTML = '';

  if (!data.length) {
    projectListEl.innerHTML = '<small>No projects yet.</small>';
    return;
  }

  data.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'project-item';
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(item.filename)}</strong>
        <small>${item.id.slice(0, 8)} • ${new Date(item.updated_at).toLocaleString()}</small>
      </div>
      <button data-id="${item.id}">Load</button>
    `;
    projectListEl.appendChild(row);
  });

  projectListEl.querySelectorAll('button[data-id]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      const projectId = event.target.dataset.id;
      projectIdInput.value = projectId;
      await loadProject(projectId);
    });
  });
};

const loadProject = async (projectId) => {
  const res = await fetch(`/api/projects/${projectId}`);
  if (!res.ok) {
    setStatus('Could not load that project id.');
    return;
  }
  const data = await res.json();
  currentProjectId = projectId;
  blocks = data.blocks || [];
  originalBlocks = clone(blocks);
  renderBlocks();
  previewEl.src = `/api/projects/${projectId}/source`;
  setStatus(`Loaded ${data.filename}. Extraction status: ${data.status}`);
  saveEnabled(true);
};

uploadBtn.addEventListener('click', async () => {
  const file = fileInput.files?.[0];
  if (!file) {
    setStatus('Please pick a file first.');
    return;
  }

  const fd = new FormData();
  fd.append('file', file);
  setStatus('Uploading and extracting text...');

  const res = await fetch('/api/upload', { method: 'POST', body: fd });
  if (!res.ok) {
    const err = await res.json();
    setStatus(`Upload failed: ${err.detail || 'unknown error'}`);
    return;
  }

  const meta = await res.json();
  currentProjectId = meta.id;
  projectIdInput.value = currentProjectId;
  await loadProject(currentProjectId);
  await renderProjects();
});

loadProjectBtn.addEventListener('click', async () => {
  const projectId = projectIdInput.value.trim();
  if (!projectId) {
    setStatus('Enter a project id first.');
    return;
  }
  await loadProject(projectId);
});

saveBtn.addEventListener('click', async () => {
  if (!currentProjectId) {
    return;
  }

  const res = await fetch(`/api/projects/${currentProjectId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocks }),
  });

  if (!res.ok) {
    setStatus('Save failed.');
    return;
  }

  const payload = await res.json();
  originalBlocks = clone(blocks);
  renderBlocks();
  setStatus(`Saved at ${new Date(payload.updated_at).toLocaleString()}`);
  await renderProjects();
});

addBlockBtn.addEventListener('click', () => {
  blocks.push({
    id: crypto.randomUUID(),
    page: 1,
    text: 'New text',
    x: 20,
    y: 20,
    w: 120,
    h: 24,
    font_family: 'Arial',
    font_size: 18,
    color: '#111111',
  });
  originalBlocks.push(clone(blocks[blocks.length - 1]));
  renderBlocks();
});

resetBtn.addEventListener('click', () => {
  blocks = clone(originalBlocks);
  renderBlocks();
  setStatus('Unsaved changes reset.');
});

searchInput.addEventListener('input', renderBlocks);
showOnlyEdited.addEventListener('change', renderBlocks);
refreshProjectsBtn.addEventListener('click', renderProjects);
darkModeToggle.addEventListener('change', () => document.body.classList.toggle('dark', darkModeToggle.checked));

renderProjects();
