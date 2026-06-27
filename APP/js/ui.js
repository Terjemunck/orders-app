// ── Badges ──────────────────────────────────────────────────────────────────
function badge(text, style) {
  const styles = {
    default:     'bg-gray-100 text-gray-700 border-gray-200',
    success:     'bg-green-100 text-green-800 border-green-200',
    info:        'bg-blue-100 text-blue-800 border-blue-200',
    warning:     'bg-yellow-100 text-yellow-800 border-yellow-200',
    destructive: 'bg-red-100 text-red-800 border-red-200',
    outline:     'bg-white text-gray-600 border-gray-300',
  }
  const cls = styles[style] ?? styles.default
  return `<span class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}">${text}</span>`
}

// ── Buttons ──────────────────────────────────────────────────────────────────
function btn(text, { variant = 'primary', size = 'md', cls = '', disabled = false, type = 'button' } = {}) {
  const base = 'inline-flex items-center gap-1.5 font-medium rounded-md transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed'
  const sizes = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-3.5 py-2 text-sm' }
  const variants = {
    primary:     'bg-gray-900 text-white hover:bg-gray-700',
    outline:     'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
    destructive: 'bg-red-600 text-white hover:bg-red-700',
    ghost:       'text-gray-600 hover:bg-gray-100',
  }
  return `<button type="${type}" class="${base} ${sizes[size]} ${variants[variant]} ${cls}" ${disabled ? 'disabled' : ''}>${text}</button>`
}

// ── Icon SVGs ────────────────────────────────────────────────────────────────
const icons = {
  plus:         '<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>',
  pencil:       '<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828A2 2 0 019.414 17H7v-2.414a2 2 0 01.586-1.414z"/></svg>',
  trash:        '<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>',
  arrowLeft:    '<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>',
  chevronRight: '<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>',
  chevronDown:  '<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>',
  check:        '<svg class="h-5 w-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
  circle:       '<svg class="h-5 w-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="2"/></svg>',
  upload:       '<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>',
  file:         '<svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>',
  play:         '<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
  lock:         '<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>',
  x:            '<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>',
  camera:       '<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>',
}

// ── Modal (native <dialog>) ───────────────────────────────────────────────────
function showModal({ id = 'modal', title, body, onClose, size = 'md' }) {
  let dlg = document.getElementById(id)
  if (dlg) dlg.remove()

  const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-3xl', '2xl': 'max-w-5xl' }
  dlg = document.createElement('dialog')
  dlg.id = id
  dlg.className = `w-full ${widths[size] ?? widths.md}`
  dlg.innerHTML = `
    <div class="p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-base font-semibold">${title}</h2>
        <button class="modal-close p-1 rounded hover:bg-gray-100 text-gray-500">${icons.x}</button>
      </div>
      <div id="${id}-body">${body}</div>
    </div>`
  document.body.appendChild(dlg)

  dlg.querySelector('.modal-close').onclick = () => closeModal(id, onClose)
  dlg.addEventListener('cancel', () => closeModal(id, onClose))
  dlg.showModal()
  return dlg
}

function closeModal(id = 'modal', onClose) {
  const dlg = document.getElementById(id)
  if (dlg) { dlg.close(); dlg.remove() }
  if (onClose) onClose()
}

// ── Form helpers ─────────────────────────────────────────────────────────────
function inputCls(extra = '') {
  return `w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${extra}`
}

function formField(label, inputHtml) {
  return `<div class="space-y-1.5"><label class="text-sm font-medium text-gray-700">${label}</label>${inputHtml}</div>`
}

function selectHtml(name, options, selected = '', placeholder = 'Select…', extra = '') {
  const opts = options.map(o =>
    `<option value="${o.value}" ${o.value === selected ? 'selected' : ''}>${o.label}</option>`
  ).join('')
  return `<select name="${name}" class="${inputCls(extra)}">
    <option value="" disabled ${!selected ? 'selected' : ''}>${placeholder}</option>
    ${opts}
  </select>`
}

// ── Table wrapper ─────────────────────────────────────────────────────────────
function tableWrap(headCols, bodyRows) {
  const ths = headCols.map(c => `<th class="px-4 py-3 text-left">${c}</th>`).join('')
  return `<div class="overflow-hidden rounded-lg border bg-white">
    <table class="w-full text-sm">
      <thead class="border-b bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
        <tr>${ths}</tr>
      </thead>
      <tbody class="divide-y">${bodyRows}</tbody>
    </table>
  </div>`
}

// ── Page header ───────────────────────────────────────────────────────────────
function pageHeader(title, actionHtml = '') {
  return `<div class="mb-6 flex items-center justify-between">
    <h1 class="text-xl font-semibold">${title}</h1>
    <div class="flex items-center gap-2">${actionHtml}</div>
  </div>`
}

// ── Error paragraph ───────────────────────────────────────────────────────────
function errorMsg(msg) {
  return msg ? `<p class="text-sm text-red-600">${msg}</p>` : ''
}
