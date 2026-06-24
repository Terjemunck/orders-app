window.render_templates = async function(container) {
  container.innerHTML = '<div class="p-6 text-sm text-gray-400">Loading…</div>'
  const STAGE_LABELS = { 1: 'Stage 1 — China', 2: 'Stage 2 — Poland', 3: 'Stage 3 — Estonia' }
  let editingTemplate = null, editingItem = null, currentTemplateId = null

  async function load() {
    const [{ data: t }, { data: p }] = await Promise.all([
      db.from('checksheet_templates').select('*, product:products(name), checksheet_items(*)').order('stage_number'),
      db.from('products').select('id, name').order('name'),
    ])
    return { templates: t ?? [], products: p ?? [] }
  }

  function renderPage({ templates, products }) {
    const cards = templates.map(t => {
      const items = (t.checksheet_items ?? []).sort((a, b) => a.sort_order - b.sort_order)
      const itemsHtml = items.length ? items.map((item, i) => `
        <div class="flex items-center justify-between rounded border px-3 py-2 text-sm">
          <span class="text-gray-500 w-6 shrink-0">${i + 1}.</span>
          <span class="flex-1">${item.question}</span>
          <div class="flex items-center gap-1 ml-2">
            <button class="p-1 text-gray-300 hover:text-gray-600 edit-item" data-tid="${t.id}" data-iid="${item.id}" data-q="${item.question.replace(/"/g,'&quot;')}" data-sort="${item.sort_order}">${icons.pencil.replace('h-4 w-4','h-3.5 w-3.5')}</button>
            <button class="p-1 text-gray-300 hover:text-red-500 del-item" data-iid="${item.id}">${icons.trash.replace('h-4 w-4','h-3.5 w-3.5')}</button>
          </div>
        </div>`).join('') : '<p class="text-sm text-gray-400">No items yet.</p>'

      return `<div class="rounded-lg border bg-white shadow-sm">
        <div class="px-5 py-4 border-b flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="font-semibold">${t.product?.name}</span>
            ${badge(STAGE_LABELS[t.stage_number], 'info')}
            ${!t.active ? badge('inactive', 'default') : ''}
          </div>
          <div class="flex items-center gap-2">
            ${btn(`${icons.plus.replace('h-4 w-4','h-3 w-3')} Add Item`, { variant: 'outline', size: 'sm', cls: `add-item-btn`, cls: 'add-item-btn' })}
            <button class="p-1 text-gray-400 hover:text-gray-700 edit-tpl" data-tid="${t.id}" data-pid="${t.product_id}" data-snum="${t.stage_number}">${icons.pencil}</button>
            <button class="p-1 text-gray-400 hover:text-red-500 del-tpl" data-tid="${t.id}" data-name="${t.product?.name} Stage ${t.stage_number}">${icons.trash}</button>
          </div>
        </div>
        <div class="p-5 space-y-1.5" data-tid="${t.id}">${itemsHtml}</div>
      </div>`
    }).join('')

    container.innerHTML = `<div class="p-6 page-enter">
      ${pageHeader('Checksheet Templates', btn(`${icons.plus} New Template`, { size: 'sm', cls: 'new-tpl-btn' }))}
      <div class="space-y-4">${templates.length ? cards : '<p class="text-sm text-gray-400">No templates yet.</p>'}</div>
    </div>`

    container.querySelector('.new-tpl-btn').onclick = () => openTemplateForm(null, products)
    container.querySelectorAll('.edit-tpl').forEach(b => {
      b.onclick = () => openTemplateForm({ id: b.dataset.tid, product_id: b.dataset.pid, stage_number: parseInt(b.dataset.snum) }, products)
    })
    container.querySelectorAll('.del-tpl').forEach(b => b.onclick = () => openDeleteTemplate(b.dataset.tid, b.dataset.name))
    container.querySelectorAll('.add-item-btn').forEach((b, i) => {
      b.onclick = () => openItemForm(null, templates[i].id)
    })
    container.querySelectorAll('.edit-item').forEach(b => {
      b.onclick = () => openItemForm({ id: b.dataset.iid, question: b.dataset.q, sort_order: parseInt(b.dataset.sort) }, b.dataset.tid)
    })
    container.querySelectorAll('.del-item').forEach(b => {
      b.onclick = async () => { await db.from('checksheet_items').delete().eq('id', b.dataset.iid); renderPage(await load()) }
    })
  }

  function openTemplateForm(tpl, products) {
    editingTemplate = tpl
    const productOpts = products.map(p => `<option value="${p.id}" ${p.id === tpl?.product_id ? 'selected' : ''}>${p.name}</option>`).join('')
    const dlg = showModal({ id: 'tpl-modal', title: tpl ? 'Edit Template' : 'New Template', body: `
      <form id="tpl-form" class="space-y-4">
        ${formField('Product', `<select name="product_id" class="${inputCls()}"><option value="">Select product</option>${productOpts}</select>`)}
        ${formField('Stage', `<select name="stage_number" class="${inputCls()}">
          <option value="">Select stage</option>
          <option value="1" ${tpl?.stage_number===1?'selected':''}>Stage 1 — China</option>
          <option value="2" ${tpl?.stage_number===2?'selected':''}>Stage 2 — Poland</option>
          <option value="3" ${tpl?.stage_number===3?'selected':''}>Stage 3 — Estonia</option>
        </select>`)}
        <p id="tpl-error" class="hidden text-sm text-red-600"></p>
        <div class="flex justify-end gap-2 pt-2">
          ${btn('Cancel', { variant: 'outline', cls: 'cancel-btn' })}
          ${btn(tpl ? 'Save' : 'Create', { type: 'submit', cls: 'submit-btn' })}
        </div>
      </form>` })
    dlg.querySelector('.cancel-btn').onclick = () => closeModal('tpl-modal')
    dlg.querySelector('#tpl-form').onsubmit = async (e) => {
      e.preventDefault()
      const fd = new FormData(e.target)
      const payload = { product_id: fd.get('product_id'), stage_number: parseInt(fd.get('stage_number')) }
      const submitBtn = dlg.querySelector('.submit-btn'); submitBtn.disabled = true; submitBtn.textContent = 'Saving…'
      const { error } = editingTemplate ? await db.from('checksheet_templates').update(payload).eq('id', editingTemplate.id) : await db.from('checksheet_templates').insert(payload)
      if (error) { dlg.querySelector('#tpl-error').textContent = error.message; dlg.querySelector('#tpl-error').classList.remove('hidden'); submitBtn.disabled = false; submitBtn.textContent = editingTemplate ? 'Save' : 'Create'; return }
      closeModal('tpl-modal'); renderPage(await load())
    }
  }

  function openDeleteTemplate(tplId, name) {
    const dlg = showModal({ id: 'del-tpl-modal', title: 'Delete Template', body: `
      <p class="text-sm text-gray-600 mb-4">Delete <strong>${name}</strong> template and all its items? This cannot be undone.</p>
      <div class="flex justify-end gap-2">
        ${btn('Cancel', { variant: 'outline', cls: 'cancel-del' })}
        ${btn('Delete', { variant: 'destructive', cls: 'confirm-del' })}
      </div>` })
    dlg.querySelector('.cancel-del').onclick = () => closeModal('del-tpl-modal')
    dlg.querySelector('.confirm-del').onclick = async () => {
      await db.from('checksheet_templates').delete().eq('id', tplId); closeModal('del-tpl-modal'); renderPage(await load())
    }
  }

  function openItemForm(item, templateId) {
    editingItem = item; currentTemplateId = templateId
    const dlg = showModal({ id: 'item-modal', title: item ? 'Edit Item' : 'Add Checksheet Item', body: `
      <form id="item-form" class="space-y-4">
        ${formField('Question', `<input name="question" value="${item?.question ?? ''}" required class="${inputCls()}" />`)}
        ${formField('Sort Order', `<input type="number" name="sort_order" value="${item?.sort_order ?? 0}" class="${inputCls()}" />`)}
        <p id="item-error" class="hidden text-sm text-red-600"></p>
        <div class="flex justify-end gap-2 pt-2">
          ${btn('Cancel', { variant: 'outline', cls: 'cancel-btn' })}
          ${btn(item ? 'Save' : 'Add', { type: 'submit', cls: 'submit-btn' })}
        </div>
      </form>` })
    dlg.querySelector('.cancel-btn').onclick = () => closeModal('item-modal')
    dlg.querySelector('#item-form').onsubmit = async (e) => {
      e.preventDefault()
      const fd = new FormData(e.target)
      const payload = { question: fd.get('question'), sort_order: parseInt(fd.get('sort_order')) }
      const submitBtn = dlg.querySelector('.submit-btn'); submitBtn.disabled = true; submitBtn.textContent = 'Saving…'
      const { error } = editingItem
        ? await db.from('checksheet_items').update(payload).eq('id', editingItem.id)
        : await db.from('checksheet_items').insert({ ...payload, template_id: currentTemplateId })
      if (error) { dlg.querySelector('#item-error').textContent = error.message; dlg.querySelector('#item-error').classList.remove('hidden'); submitBtn.disabled = false; submitBtn.textContent = editingItem ? 'Save' : 'Add'; return }
      closeModal('item-modal'); renderPage(await load())
    }
  }

  renderPage(await load())
}
