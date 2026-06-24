window.render_companies = async function(container) {
  container.innerHTML = '<div class="p-6 text-sm text-gray-400">Loading…</div>'
  let editing = null

  async function load() {
    const { data } = await db.from('companies').select('*').order('name')
    return data ?? []
  }

  const typeStyles = { system_mgr: 'info', factory: 'warning', customer: 'default' }

  function renderTable(companies) {
    const rows = companies.map(c => `<tr key="${c.id}" class="hover:bg-gray-50">
      <td class="px-4 py-3 font-medium">${c.name}</td>
      <td class="px-4 py-3">${badge(c.type, typeStyles[c.type] ?? 'default')}</td>
      <td class="px-4 py-3 text-gray-500">${c.stage_number ?? '—'}</td>
      <td class="px-4 py-3"><div class="flex items-center gap-1 justify-end">
        <button class="p-1 text-gray-400 hover:text-gray-700 rounded edit-btn" data-id="${c.id}">${icons.pencil}</button>
        <button class="p-1 text-gray-400 hover:text-red-500 rounded del-btn" data-id="${c.id}">${icons.trash}</button>
      </div></td>
    </tr>`).join('')

    container.innerHTML = `<div class="p-6 page-enter">
      ${pageHeader('Companies', btn(`${icons.plus} New Company`, { size: 'sm', cls: 'new-btn' }))}
      ${companies.length ? tableWrap(['Name','Type','Stage',''], rows) : '<p class="text-sm text-gray-400">No companies yet.</p>'}
    </div>`

    container.querySelector('.new-btn').onclick = () => openForm(null)
    container.querySelectorAll('.edit-btn').forEach(b => b.onclick = () => openForm(companies.find(c => c.id === b.dataset.id)))
    container.querySelectorAll('.del-btn').forEach(b => b.onclick = () => openDelete(companies.find(c => c.id === b.dataset.id)))
  }

  function openForm(company) {
    editing = company
    const body = `<form id="co-form" class="space-y-4">
      ${formField('Name', `<input name="name" value="${company?.name ?? ''}" required class="${inputCls()}" />`)}
      ${formField('Type', `<select name="type" class="${inputCls()}">
        <option value="">Select type</option>
        <option value="system_mgr" ${company?.type === 'system_mgr' ? 'selected' : ''}>System Manager</option>
        <option value="factory" ${company?.type === 'factory' ? 'selected' : ''}>Factory</option>
        <option value="customer" ${company?.type === 'customer' ? 'selected' : ''}>Customer</option>
      </select>`)}
      <div id="stage-field" class="${company?.type === 'factory' ? '' : 'hidden'} space-y-1.5">
        <label class="text-sm font-medium text-gray-700">Stage Number</label>
        <select name="stage_number" class="${inputCls()}">
          <option value="">Select stage</option>
          <option value="1" ${company?.stage_number === 1 ? 'selected' : ''}>1 — China (Tube production)</option>
          <option value="2" ${company?.stage_number === 2 ? 'selected' : ''}>2 — Poland (Tube filling)</option>
          <option value="3" ${company?.stage_number === 3 ? 'selected' : ''}>3 — Estonia (Packaging)</option>
        </select>
      </div>
      ${errorMsg('')}
      <div class="flex justify-end gap-2 pt-2">
        ${btn('Cancel', { variant: 'outline', cls: 'cancel-btn' })}
        ${btn(company ? 'Save' : 'Create', { type: 'submit', cls: 'submit-btn' })}
      </div>
    </form>`

    const dlg = showModal({ id: 'co-modal', title: company ? 'Edit Company' : 'New Company', body })
    dlg.querySelector('.cancel-btn').onclick = () => closeModal('co-modal')
    dlg.querySelector('[name=type]').onchange = function() {
      dlg.querySelector('#stage-field').classList.toggle('hidden', this.value !== 'factory')
    }
    dlg.querySelector('#co-form').onsubmit = async (e) => {
      e.preventDefault()
      const fd = new FormData(e.target)
      const type = fd.get('type')
      const payload = { name: fd.get('name'), type, stage_number: type === 'factory' ? parseInt(fd.get('stage_number')) : null }
      const submitBtn = dlg.querySelector('.submit-btn')
      submitBtn.disabled = true; submitBtn.textContent = 'Saving…'
      const { error } = editing ? await db.from('companies').update(payload).eq('id', editing.id) : await db.from('companies').insert(payload)
      if (error) { submitBtn.disabled = false; submitBtn.textContent = editing ? 'Save' : 'Create'; dlg.querySelector('p').textContent = error.message; return }
      closeModal('co-modal')
      renderTable(await load())
    }
  }

  function openDelete(company) {
    const dlg = showModal({ id: 'del-modal', title: 'Delete Company', body: `
      <p class="text-sm text-gray-600 mb-4">Delete <strong>${company.name}</strong>? This cannot be undone.</p>
      <div class="flex justify-end gap-2">
        ${btn('Cancel', { variant: 'outline', cls: 'cancel-del' })}
        ${btn('Delete', { variant: 'destructive', cls: 'confirm-del' })}
      </div>` })
    dlg.querySelector('.cancel-del').onclick = () => closeModal('del-modal')
    dlg.querySelector('.confirm-del').onclick = async () => {
      await db.from('companies').delete().eq('id', company.id)
      closeModal('del-modal')
      renderTable(await load())
    }
  }

  renderTable(await load())
}
