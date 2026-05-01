import { FFmpeg } from 'https://esm.sh/@ffmpeg/ffmpeg@0.12.10';
import { fetchFile, toBlobURL } from 'https://esm.sh/@ffmpeg/util@0.12.1';

// ── DOM refs ──────────────────────────────────────────────
const dropZone    = document.getElementById('dropZone');
const fileInput   = document.getElementById('fileInput');
const fileList    = document.getElementById('fileList');
const colorSwatch = document.getElementById('colorSwatch');
const colorBtn    = document.getElementById('colorBtn');
const colorPicker = document.getElementById('colorPicker');
const clearBtn    = document.getElementById('clearBtn');
const actionBtn   = document.getElementById('actionBtn');
const statusBar   = document.getElementById('statusBar');

// ── State ─────────────────────────────────────────────────
let ffmpeg = null;
let selectedFiles = [];       // File[]
let fileRows = new Map();     // File → { el, fillEl, statusEl }
let bgColor = '#000000';
let isRunning = false;
let stopFlag = false;
let currentDuration = 0;     // seconds, used by log handler for progress
let currentFillEl = null;    // progress bar DOM element for current file

// ── Init ──────────────────────────────────────────────────
colorSwatch.style.backgroundColor = bgColor;
registerSW();
loadFFmpeg();

async function registerSW() {
  if ('serviceWorker' in navigator) {
    await navigator.serviceWorker.register('./sw.js');
  }
}

async function loadFFmpeg() {
  try {
    ffmpeg = new FFmpeg();

    ffmpeg.on('log', ({ message }) => {
      if (!currentFillEl || currentDuration === 0) return;
      const match = message.match(/time=(\d+):(\d+):([\d.]+)/);
      if (match) {
        const elapsed = parseInt(match[1]) * 3600 +
                        parseInt(match[2]) * 60 +
                        parseFloat(match[3]);
        const pct = Math.min(elapsed / currentDuration, 1.0) * 100;
        currentFillEl.style.width = pct + '%';
      }
    });

    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      workerURL: await toBlobURL(
        'https://esm.sh/@ffmpeg/ffmpeg@0.12.10/es2022/worker.js',
        'text/javascript'
      ),
    });

    actionBtn.textContent = '開始轉換';
    actionBtn.disabled = false;
    statusBar.textContent = '尚未選擇檔案';
  } catch (err) {
    statusBar.textContent = 'FFmpeg 載入失敗：' + err.message;
    console.error('[FFmpeg load error]', err);
  }
}

// ── File input ────────────────────────────────────────────
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () =>
  dropZone.classList.remove('drag-over')
);

dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  addFiles([...e.dataTransfer.files]);
});

fileInput.addEventListener('change', () => {
  addFiles([...fileInput.files]);
  fileInput.value = '';
});

function addFiles(files) {
  const videoExts = /\.(mp4|mov|avi|mkv|wmv|m4v|flv)$/i;
  for (const file of files) {
    if (!file.type.startsWith('video/') && !videoExts.test(file.name)) continue;
    if (selectedFiles.some(f => f.name === file.name && f.size === file.size)) continue;
    selectedFiles.push(file);
    const row = createFileRow(file);
    fileList.appendChild(row.el);
    fileRows.set(file, row);
  }
  statusBar.textContent = `已選擇 ${selectedFiles.length} 個檔案`;
}

function createFileRow(file) {
  const el = document.createElement('div');
  el.className = 'file-row';

  const nameEl = document.createElement('span');
  nameEl.className = 'file-name';
  nameEl.textContent = file.name;

  const trackEl = document.createElement('div');
  trackEl.className = 'progress-track';
  const fillEl = document.createElement('div');
  fillEl.className = 'progress-fill';
  trackEl.appendChild(fillEl);

  const statusEl = document.createElement('span');
  statusEl.className = 'file-status';
  statusEl.textContent = '等待中';

  el.append(nameEl, trackEl, statusEl);
  return { el, fillEl, statusEl };
}

// ── Color picker ──────────────────────────────────────────
colorBtn.addEventListener('click', () => colorPicker.click());

colorPicker.addEventListener('input', () => {
  bgColor = colorPicker.value;
  colorSwatch.style.backgroundColor = bgColor;
});

// ── Action button ─────────────────────────────────────────
actionBtn.addEventListener('click', () => {
  if (isRunning) {
    stopFlag = true;
    actionBtn.textContent = '停止中…';
    actionBtn.disabled = true;
  } else {
    if (selectedFiles.length === 0) {
      statusBar.textContent = '請先選擇影片檔案';
      return;
    }
    startConversion();
  }
});

async function startConversion() {
  if (!ffmpeg) { statusBar.textContent = 'FFmpeg 尚未載入'; return; }
  isRunning = true;
  stopFlag = false;
  actionBtn.textContent = '停止';
  clearBtn.disabled = true;

  let completed = 0;
  const total = selectedFiles.length;

  for (const file of selectedFiles) {
    if (stopFlag) break;

    const row = fileRows.get(file);
    row.statusEl.textContent = '轉換中';

    const ok = await convertFile(file, row.fillEl);

    if (ok) {
      completed++;
      row.statusEl.textContent = '完成';
      statusBar.textContent =
        `${completed} / ${total} 完成　最新：${getOutputName(file.name)} 已下載`;
    } else {
      row.statusEl.textContent = stopFlag ? '已停止' : '失敗';
    }
  }

  isRunning = false;
  stopFlag = false;
  actionBtn.textContent = '開始轉換';
  actionBtn.disabled = false;
  clearBtn.disabled = false;

  statusBar.textContent = completed === total
    ? `全部完成！共轉換 ${completed} 個檔案`
    : `已停止。完成 ${completed} / ${total} 個`;
}

function getOutputName(filename) {
  const dot = filename.lastIndexOf('.');
  const base = dot === -1 ? filename : filename.slice(0, dot);
  return base + '_1x1.mp4';
}

function getVideoMeta(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const objectURL = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(objectURL);

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Metadata read timed out for "${file.name}"`));
    }, 10_000);

    video.onloadedmetadata = () => {
      clearTimeout(timer);
      cleanup();
      resolve({ width: video.videoWidth, height: video.videoHeight, duration: video.duration });
    };
    video.onerror = () => {
      clearTimeout(timer);
      cleanup();
      reject(new Error(`Cannot read metadata for "${file.name}"`));
    };
    video.src = objectURL;
  });
}

async function convertFile(file, fillEl) {
  const ext = file.name.slice(file.name.lastIndexOf('.')) || '.mp4';
  const inputName = 'input' + ext;
  const outputName = 'output.mp4';
  let inputWritten = false;

  try {
    const { width, height, duration } = await getVideoMeta(file);
    const size = Math.max(width, height);
    const color = bgColor.replace('#', '');

    currentDuration = duration;
    currentFillEl = fillEl;

    await ffmpeg.writeFile(inputName, await fetchFile(file));
    inputWritten = true;

    await ffmpeg.exec([
      '-i', inputName,
      '-vf',
        `scale=${size}:${size}:force_original_aspect_ratio=decrease,` +
        `pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:0x${color}`,
      '-c:v', 'libx264',
      '-crf', '18',
      '-preset', 'slow',
      '-c:a', 'copy',
      '-pix_fmt', 'yuv420p',
      '-y',
      outputName,
    ]);

    const data = await ffmpeg.readFile(outputName);
    const blob = new Blob([data], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = getOutputName(file.name);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);

    fillEl.style.width = '100%';
    return true;
  } catch (err) {
    console.error('[convertFile error]', err);
    return false;
  } finally {
    currentDuration = 0;
    currentFillEl = null;
    if (inputWritten) {
      await ffmpeg.deleteFile(inputName).catch(() => {});
    }
    await ffmpeg.deleteFile(outputName).catch(() => {});
  }
}

// ── Clear queue ───────────────────────────────────────────
clearBtn.addEventListener('click', () => {
  if (isRunning) return;
  selectedFiles = [];
  fileRows.clear();
  fileList.innerHTML = '';
  statusBar.textContent = '佇列已清除';
});
