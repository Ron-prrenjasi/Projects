const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const saveBtn = document.getElementById('saveBtn');
const statusEl = document.getElementById('status');
const blocksEl = document.getElementById('blocks');
const previewEl = document.getElementById('preview');

let currentProjectId = null;
let blocks = [];

const setStatus = (msg) => {
  statusEl.textContent = msg;
};

const renderBlocks = () => {
  blocksEl.innerHTML = '';

  blocks.forEach((block, idx) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'block';

    wrapper.innerHTML = `
      <label>Text</label>
      <input data-idx="${idx}" data-key="text" value="${(block.text || '').replaceAll('"', '&quot;')}" />
      <label>Font family</label>
      <input data-idx="${idx}" data-key="font_family" value="${block.font_family || 'Arial'}" />
      <label>Font size</label>
      <input data-idx="${idx}" data-key="font_size" type="number" min="8" value="${block.font_size || 18}" />
      <label>Color</label>
      <input data-idx="${idx}" data-key="color" type="color" value="${block.color || '#111111'}" />
      <small>Page ${block.page} • x:${Math.round(block.x)} y:${Math.round(block.y)}</small>
    `;

    blocksEl.appendChild(wrapper);
  });

  blocksEl.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', (e) => {
      const idx = Number(e.target.dataset.idx);
      const key = e.target.dataset.key;
      blocks[idx][key] = key === 'font_size' ? Number(e.target.value) : e.target.value;
    });
  });
};

const loadProject = async (projectId) => {
  const res = await fetch(`/api/projects/${projectId}`);
  const data = await res.json();
  blocks = data.blocks || [];
  renderBlocks();
  previewEl.src = `/api/projects/${projectId}/source`;
  setStatus(`Loaded ${data.filename}. Extraction status: ${data.status}`);
  saveBtn.disabled = false;
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
  await loadProject(currentProjectId);
});

saveBtn.addEventListener('click', async () => {
  if (!currentProjectId) return;

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
  setStatus(`Saved at ${payload.updated_at}`);
});
