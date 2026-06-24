window.render_settings = async function(container) {
  container.innerHTML = '<div class="p-6 text-sm text-gray-400">Loading…</div>'

  const SETTING_LABELS = { email_from_name: 'Email from name', email_from_address: 'Email from address', app_url: 'App URL (used in email links)' }

  async function loadAll() {
    const [{ data: settingsData }, { data: docTypes }] = await Promise.all([
      db.from('app_settings').select('key, value'),
      db.from('document_types').select('id, name').order('name'),
    ])
    const settings = {}
    for (const row of settingsData ?? []) settings[row.key] = row.value
    return { settings, docTypes: docTypes ?? [] }
  }

  function renderDocTypeList(docTypes) {
    const listEl = container.querySelector('#doc-type-list')
    if (!listEl) return
    if (!docTypes.length) {
      listEl.innerHTML = '<p class="text-sm text-gray-400 italic">No document types yet.</p>'
      return
    }
    listEl.innerHTML = docTypes.map(dt => `
      <div class="flex items-center justify-between py-1.5 border-b last:border-0 doc-type-row" data-id="${dt.id}">
        <span class="text-sm text-gray-800 doc-type-name">${dt.name}</span>
        <div class="flex items-center gap-1">
          <button class="p-1 text-gray-400 hover:text-gray-700 rounded edit-dt-btn" data-id="${dt.id}" data-name="${dt.name}" title="Rename">${icons.pencil}</button>
          <button class="p-1 text-gray-400 hover:text-red-500 rounded del-dt-btn" data-id="${dt.id}" data-name="${dt.name}" title="Delete">${icons.trash}</button>
        </div>
      </div>`).join('')
    bindDocTypeList()
  }

  function bindDocTypeList() {
    container.querySelectorAll('.edit-dt-btn').forEach(b => {
      b.onclick = () => openEditDocType(b.dataset.id, b.dataset.name)
    })
    container.querySelectorAll('.del-dt-btn').forEach(b => {
      b.onclick = () => openDeleteDocType(b.dataset.id, b.dataset.name)
    })
  }

  async function openEditDocType(id, currentName) {
    const dlg = showModal({ id: 'dt-edit-modal', title: id ? 'Rename Document Type' : 'Add Document Type', body: `
      <div class="space-y-4">
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Name</label>
          <input id="dt-name-input" value="${currentName ?? ''}" placeholder="e.g. CE Certificate" class="${inputCls()}" autofocus />
        </div>
        <p id="dt-error" class="hidden text-sm text-red-600"></p>
        <div class="flex justify-end gap-2">
          ${btn('Cancel', { variant: 'outline', cls: 'cancel-dt' })}
          ${btn(id ? 'Save' : 'Add', { cls: 'save-dt' })}
        </div>
      </div>` })
    dlg.querySelector('.cancel-dt').onclick = () => closeModal('dt-edit-modal')
    dlg.querySelector('.save-dt').onclick = async () => {
      const name = dlg.querySelector('#dt-name-input').value.trim()
      const errEl = dlg.querySelector('#dt-error')
      const saveBtn = dlg.querySelector('.save-dt')
      errEl.classList.add('hidden')
      if (!name) { errEl.textContent = 'Name is required.'; errEl.classList.remove('hidden'); return }
      saveBtn.disabled = true; saveBtn.textContent = 'Saving…'
      let error
      if (id) {
        ({ error } = await db.from('document_types').update({ name }).eq('id', id))
      } else {
        ({ error } = await db.from('document_types').insert({ name }))
      }
      if (error) {
        errEl.textContent = error.message.includes('unique') ? 'A document type with this name already exists.' : error.message
        errEl.classList.remove('hidden')
        saveBtn.disabled = false; saveBtn.textContent = id ? 'Save' : 'Add'
        return
      }
      closeModal('dt-edit-modal')
      const { data } = await db.from('document_types').select('id, name').order('name')
      renderDocTypeList(data ?? [])
    }
    setTimeout(() => dlg.querySelector('#dt-name-input')?.focus(), 50)
  }

  async function openDeleteDocType(id, name) {
    const dlg = showModal({ id: 'dt-del-modal', title: 'Delete Document Type', body: `
      <p class="text-sm text-gray-600 mb-4">Delete <strong>${name}</strong>? Milestones already using this type will keep their slot but it won't link to the library anymore.</p>
      <div class="flex justify-end gap-2">
        ${btn('Cancel', { variant: 'outline', cls: 'cancel-del-dt' })}
        ${btn('Delete', { variant: 'destructive', cls: 'confirm-del-dt' })}
      </div>` })
    dlg.querySelector('.cancel-del-dt').onclick = () => closeModal('dt-del-modal')
    dlg.querySelector('.confirm-del-dt').onclick = async () => {
      const confirmBtn = dlg.querySelector('.confirm-del-dt')
      confirmBtn.disabled = true; confirmBtn.textContent = 'Deleting…'
      const { error } = await db.from('document_types').delete().eq('id', id)
      if (error) {
        const errP = document.createElement('p')
        errP.className = 'text-sm text-red-600 mt-2'
        errP.textContent = error.message
        confirmBtn.parentElement.before(errP)
        confirmBtn.disabled = false; confirmBtn.textContent = 'Delete'
        return
      }
      closeModal('dt-del-modal')
      const { data } = await db.from('document_types').select('id, name').order('name')
      renderDocTypeList(data ?? [])
    }
  }

  const { settings, docTypes } = await loadAll()

  container.innerHTML = `<div class="p-6 max-w-lg page-enter">
    <div class="mb-6">
      <h1 class="text-xl font-semibold">Settings</h1>
      <p class="text-sm text-gray-500 mt-1">System-wide configuration.</p>
    </div>

    <form id="settings-form" class="space-y-6">
      <div class="rounded-lg border bg-white p-5 space-y-4">
        <h2 class="text-sm font-semibold text-gray-700 uppercase tracking-wide">Email</h2>
        ${['email_from_name','email_from_address','app_url'].map(key => formField(
          SETTING_LABELS[key] ?? key,
          `<input name="${key}" value="${settings[key] ?? ''}" required class="${inputCls()}" />`
        )).join('')}
      </div>
      <p id="settings-error" class="hidden text-sm text-red-600"></p>
      <p id="settings-saved" class="hidden text-sm text-green-600">Saved.</p>
      <div class="flex items-center gap-3">
        ${btn('Save', { type: 'submit', cls: 'save-btn' })}
      </div>
    </form>

    <div class="rounded-lg border bg-white p-5 mt-8 space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold text-gray-700 uppercase tracking-wide">Document Types</h2>
        ${btn(`${icons.plus} Add type`, { size: 'sm', cls: 'add-dt-btn' })}
      </div>
      <div id="doc-type-list"></div>
    </div>
  </div>`

  container.querySelector('#settings-form').onsubmit = async (e) => {
    e.preventDefault()
    const fd = new FormData(e.target)
    const saveBtn = container.querySelector('.save-btn')
    const errEl = container.querySelector('#settings-error')
    const savedEl = container.querySelector('#settings-saved')
    saveBtn.disabled = true; saveBtn.textContent = 'Saving…'
    errEl.classList.add('hidden'); savedEl.classList.add('hidden')

    for (const [key] of Object.entries(SETTING_LABELS)) {
      const { error } = await db.from('app_settings').update({ value: fd.get(key), updated_at: new Date().toISOString() }).eq('key', key)
      if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); saveBtn.disabled = false; saveBtn.textContent = 'Save'; return }
    }
    saveBtn.disabled = false; saveBtn.textContent = 'Save'
    savedEl.classList.remove('hidden')
    setTimeout(() => savedEl.classList.add('hidden'), 3000)
  }

  container.querySelector('.add-dt-btn').onclick = () => openEditDocType(null, '')

  renderDocTypeList(docTypes)
}
