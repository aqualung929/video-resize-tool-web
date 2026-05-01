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
    });

    actionBtn.textContent = '開始轉換';
    actionBtn.disabled = false;
    statusBar.textContent = '尚未選擇檔案';
  } catch (err) {
    statusBar.textContent = 'FFmpeg 載入失敗：' + err.message;
    console.error('[FFmpeg load error]', err);
  }
}
