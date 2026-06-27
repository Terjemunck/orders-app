window.render_products = async function(container) {
  container.innerHTML = '<div class="p-6 text-sm text-gray-400">Loading…</div>'
  let editingProduct = null, editingVariant = null, variantProductId = null
  const expanded = {}

  // ── Milestone template management ─────────────────────────────────────────

  async function openMilestoneTemplates(product) {
    const { data: templates, error: tplErr } = await db.from('milestone_templates')
      .select('id, name, category, sort_order, factory_company_id, require_prev_completed, enforce_date_order, milestone_template_items(id, question, sort_order)')
      .eq('product_id', product.id)
      .order('sort_order')

    const [{ data: factories }, { data: allCosList }] = await Promise.all([
      db.from('companies').select('id, name').eq('type', 'factory').order('name'),
      db.from('companies').select('id, name, type').in('type', ['customer', 'factory']).order('name'),
    ])
    const factoryOpts = (factories ?? []).map(c => `<option value="${c.id}">${c.name}</option>`).join('')
    const allCos = allCosList ?? []
    const factoryMap = Object.fromEntries((factories ?? []).map(c => [c.id, c.name]))

    let currentTemplates = templates ?? []
    let dragId = null

    function templateListHtml(tpls, err) {
      if (err) return `<p class="text-sm text-red-600">Error loading templates: ${err.message}</p>`
      if (!tpls?.length) return '<p class="text-sm text-gray-400">No milestones configured for this product yet.</p>'
      return tpls.map((t, idx) => {
        const itemCount = t.milestone_template_items?.length ?? 0
        return `<div class="rounded border bg-white flex items-center gap-1 drag-row transition-opacity" draggable="true" data-id="${t.id}">
          <span class="px-2 py-3 text-gray-300 hover:text-gray-500 cursor-grab select-none text-sm font-bold tracking-tighter" title="Drag to reorder">⠿</span>
          <span class="text-xs text-gray-300 w-5 shrink-0">${idx + 1}.</span>
          <div class="flex-1 py-2.5 min-w-0">
            <span class="text-sm font-medium">${t.name}</span>
            ${t.category ? `<span class="ml-2 text-xs text-gray-400">${t.category}</span>` : ''}
            ${t.factory_company_id && factoryMap[t.factory_company_id] ? `<span class="ml-2 text-xs text-gray-400">· ${factoryMap[t.factory_company_id]}</span>` : ''}
            <span class="ml-2 text-xs text-gray-400">${itemCount} item${itemCount !== 1 ? 's' : ''}</span>
          </div>
          <div class="flex items-center gap-1 px-2 shrink-0">
            <button class="p-1 text-gray-400 hover:text-gray-700 edit-tpl" data-id="${t.id}">${icons.pencil.replace('h-4 w-4','h-3.5 w-3.5')}</button>
            <button class="p-1 text-gray-400 hover:text-red-500 del-tpl" data-id="${t.id}" data-name="${t.name}">${icons.trash.replace('h-4 w-4','h-3.5 w-3.5')}</button>
          </div>
        </div>`
      }).join('')
    }

    const dlg = showModal({ id: 'ms-tpl-modal', title: `Milestone Templates — ${product.name}`, body: `
      <div class="space-y-3">
        <div id="tpl-list" class="space-y-1.5">${templateListHtml(templates, tplErr)}</div>
        <button class="add-tpl-btn inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">${icons.plus} Add Milestone</button>
        <div class="flex justify-end pt-2">
          ${btn('Close', { variant: 'outline', cls: 'close-tpl' })}
        </div>
      </div>` })

    dlg.querySelector('.close-tpl').onclick = () => closeModal('ms-tpl-modal')

    async function refreshList() {
      const { data: refreshed, error: refreshErr } = await db.from('milestone_templates')
        .select('id, name, category, sort_order, factory_company_id, require_prev_completed, enforce_date_order, milestone_template_items(id, question, sort_order)')
        .eq('product_id', product.id).order('sort_order')
      currentTemplates = refreshed ?? []
      dlg.querySelector('#tpl-list').innerHTML = templateListHtml(refreshed, refreshErr)
      bindList(refreshed)
    }

    function bindList(tpls) {
      currentTemplates = tpls ?? []

      dlg.querySelectorAll('.edit-tpl').forEach(b => {
        const t = currentTemplates.find(x => x.id === b.dataset.id)
        if (t) b.onclick = () => openTemplateForm(t, product.id, factoryOpts, allCos, refreshList, dlg)
      })
      dlg.querySelectorAll('.del-tpl').forEach(b => {
        b.onclick = () => openDeleteTemplate(b.dataset.id, b.dataset.name, refreshList)
      })

      // Drag-to-reorder
      dlg.querySelectorAll('.drag-row').forEach(row => {
        row.addEventListener('dragstart', () => {
          dragId = row.dataset.id
          setTimeout(() => row.classList.add('opacity-40'), 0)
        })
        row.addEventListener('dragend', () => {
          dragId = null
          row.classList.remove('opacity-40')
          dlg.querySelectorAll('.drag-row').forEach(r => r.classList.remove('border-blue-400', 'border-t-2', 'border-b-2'))
        })
        row.addEventListener('dragover', e => {
          e.preventDefault()
          if (row.dataset.id !== dragId) row.classList.add('border-t-2', 'border-blue-400')
        })
        row.addEventListener('dragleave', () => row.classList.remove('border-t-2', 'border-blue-400'))
        row.addEventListener('drop', async e => {
          e.preventDefault()
          row.classList.remove('border-t-2', 'border-blue-400')
          if (!dragId || dragId === row.dataset.id) return

          const fromIdx = currentTemplates.findIndex(t => t.id === dragId)
          const toIdx = currentTemplates.findIndex(t => t.id === row.dataset.id)
          if (fromIdx === -1 || toIdx === -1) return

          const reordered = [...currentTemplates]
          const [moved] = reordered.splice(fromIdx, 1)
          reordered.splice(toIdx, 0, moved)

          await Promise.all(reordered.map((t, idx) =>
            db.from('milestone_templates').update({ sort_order: idx + 1 }).eq('id', t.id)
          ))
          await refreshList()
        })
      })
    }

    dlg.querySelector('.add-tpl-btn').onclick = () => {
      const nextSort = currentTemplates.length > 0
        ? Math.max(...currentTemplates.map(t => t.sort_order)) + 1
        : 1
      openTemplateForm(null, product.id, factoryOpts, allCos, refreshList, dlg, nextSort)
    }
    bindList(templates)
  }

  async function openTemplateForm(template, productId, factoryOpts, allCos, onSave, parentDlg, defaultSortOrder = 0) {
    const isEdit = !!template
    const items = (template?.milestone_template_items ?? []).sort((a, b) => a.sort_order - b.sort_order)
    let itemList = items.map(i => ({ id: i.id, question: i.question, sort_order: i.sort_order, photoCount: itemPhotoMap[i.id] ?? 0 }))

    // Fetch existing visible companies + users + template contacts + required docs
    let visibleIds = new Set()
    let allUsers = []
    let tplContactsByRole = { milestone_owner: new Set(), checksheet_owner: new Set() }
    let allDocTypes = []
    let checkedLibraryIds = new Set()   // document_type_id UUIDs checked
    let customDocs = []                 // [{ custom_name }] free-text slots
    const fetches = [
      db.from('users').select('id, name, email').order('name'),
      db.from('document_types').select('id, name').order('name'),
    ]
    if (isEdit && template.id) {
      fetches.push(
        db.from('milestone_template_companies').select('company_id').eq('template_id', template.id),
        db.from('milestone_template_contacts').select('user_id, role').eq('template_id', template.id),
        db.from('milestone_template_required_docs').select('id, document_type_id, custom_name').eq('template_id', template.id),
      )
    }
    const results = await Promise.all(fetches)
    allUsers = results[0]?.data ?? []
    allDocTypes = results[1]?.data ?? []
    if (isEdit && template.id) {
      visibleIds = new Set((results[2]?.data ?? []).map(r => r.company_id))
      for (const c of results[3]?.data ?? []) {
        tplContactsByRole[c.role]?.add(c.user_id)
      }
      for (const rd of results[4]?.data ?? []) {
        if (rd.document_type_id) {
          checkedLibraryIds.add(rd.document_type_id)
        } else if (rd.custom_name) {
          customDocs.push({ custom_name: rd.custom_name })
        }
      }
    }

    // Fetch photo counts per template item
    let itemPhotoMap = {}
    if (isEdit && items.length) {
      const { data: photoRows } = await db.from('milestone_template_item_photos')
        .select('item_id').in('item_id', items.map(i => i.id))
      for (const p of photoRows ?? []) {
        itemPhotoMap[p.item_id] = (itemPhotoMap[p.item_id] ?? 0) + 1
      }
    }

    function itemsHtml() {
      return itemList.map((it, idx) => `<div class="flex items-center gap-1.5 item-row" data-idx="${idx}">
        <input type="text" class="item-question flex-1 rounded border border-gray-300 px-2 py-1 text-xs" placeholder="Checksheet question…" value="${it.question}" />
        ${it.id ? `<button type="button" class="item-photo-btn shrink-0 flex items-center gap-0.5 p-0.5 rounded ${it.photoCount > 0 ? 'text-blue-500 hover:text-blue-700' : 'text-gray-300 hover:text-gray-500'}"
          data-item-id="${it.id}" data-label="${(it.question || 'Item').replace(/"/g, '&quot;')}" title="${it.photoCount > 0 ? it.photoCount + ' photo(s)' : 'Add reference photos'}">
          ${icons.camera.replace('h-4 w-4','h-3.5 w-3.5')}${it.photoCount > 0 ? `<span class="text-xs">${it.photoCount}</span>` : ''}
        </button>` : `<span class="shrink-0 w-6"></span>`}
        <button type="button" class="remove-item shrink-0 p-0.5 text-gray-300 hover:text-red-500" data-idx="${idx}">${icons.x.replace('h-4 w-4','h-3 w-3')}</button>
      </div>`).join('')
    }

    function visibilityHtml() {
      if (!allCos.length) return '<p class="text-xs text-gray-400">No companies found.</p>'
      return allCos.map(c => `<label class="flex items-center gap-2 cursor-pointer py-0.5">
        <input type="checkbox" class="vis-check rounded" value="${c.id}" ${visibleIds.has(c.id) ? 'checked' : ''} />
        <span class="text-xs">${c.name} <span class="text-gray-400">${c.type === 'factory' ? '· factory' : '· customer'}</span></span>
      </label>`).join('')
    }

    function contactsRoleHtml(role) {
      if (!allUsers.length) return '<p class="text-xs text-gray-400 italic">No users found.</p>'
      return allUsers.map(u => `<label class="flex items-center gap-2 cursor-pointer py-0.5">
        <input type="checkbox" class="contact-check rounded" data-role="${role}" value="${u.id}" ${tplContactsByRole[role]?.has(u.id) ? 'checked' : ''} />
        <span class="text-xs">${u.name ?? u.email}</span>
      </label>`).join('')
    }

    function requiredDocsLibraryHtml() {
      if (!allDocTypes.length) return '<p class="text-xs text-gray-400 italic">No types yet — add in Settings.</p>'
      return allDocTypes.map(dt => `<label class="flex items-center gap-2 cursor-pointer py-0.5">
        <input type="checkbox" class="req-doc-check rounded" value="${dt.id}" ${checkedLibraryIds.has(dt.id) ? 'checked' : ''} />
        <span class="text-xs">${dt.name}</span>
      </label>`).join('')
    }

    function customDocsHtml() {
      if (!customDocs.length) return ''
      return customDocs.map((d, i) => `<div class="flex items-center gap-1.5 custom-doc-row" data-idx="${i}">
        <span class="text-xs text-gray-700 flex-1">${d.custom_name}</span>
        <button type="button" class="remove-custom-doc shrink-0 p-0.5 text-gray-300 hover:text-red-500" data-idx="${i}">${icons.x.replace('h-4 w-4','h-3 w-3')}</button>
      </div>`).join('')
    }

    function renderCustomDocs(dlg) {
      const el = dlg.querySelector('#custom-docs-list')
      if (el) el.innerHTML = customDocsHtml()
      dlg.querySelectorAll('.remove-custom-doc').forEach(b => {
        b.onclick = () => { customDocs.splice(parseInt(b.dataset.idx), 1); renderCustomDocs(dlg) }
      })
    }

    const sectionHead = (label) => `<p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">${label}</p>`

    const dlg2 = showModal({ id: 'tpl-form-modal', title: isEdit ? 'Edit Milestone' : 'Add Milestone', size: 'xl', body: `
      <form id="tpl-form">
        <div class="grid grid-cols-3 gap-4">

          <!-- COL 1: core fields + checksheet -->
          <div class="space-y-3">
            <div class="space-y-1">
              <label class="text-xs font-medium text-gray-600">Name</label>
              <input name="name" required value="${template?.name ?? ''}" placeholder="e.g. Production complete" class="${inputCls()}" />
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div class="space-y-1">
                <label class="text-xs font-medium text-gray-600">Category</label>
                <input name="category" value="${template?.category ?? ''}" placeholder="e.g. Production" class="${inputCls()}" />
              </div>
              <div class="space-y-1">
                <label class="text-xs font-medium text-gray-600">Sort</label>
                <input type="number" name="sort_order" value="${template?.sort_order ?? defaultSortOrder}" min="0" class="${inputCls()}" />
              </div>
            </div>
            <div class="space-y-1">
              <label class="text-xs font-medium text-gray-600">Factory</label>
              <select name="factory_company_id" class="${inputCls()}"><option value="">None</option>${factoryOpts.replace(`value="${template?.factory_company_id}"`, `value="${template?.factory_company_id}" selected`)}</select>
            </div>
            <div class="space-y-1">
              <div class="flex items-center justify-between">
                <label class="text-xs font-medium text-gray-600">Checksheet items</label>
                <button type="button" id="add-item-btn" class="flex items-center gap-0.5 text-xs text-blue-600 hover:text-blue-800">${icons.plus.replace('h-4 w-4','h-3 w-3')} Add</button>
              </div>
              <div id="items-container" class="space-y-1 max-h-52 overflow-y-auto pr-0.5 rounded border border-gray-100 p-1.5 bg-gray-50 min-h-8">${itemList.length ? itemsHtml() : '<p class="text-xs text-gray-400 italic px-1">No items yet</p>'}</div>
            </div>
          </div>

          <!-- COL 2: sequence rules + contacts -->
          <div class="space-y-4 border-l pl-4">

            <div>
              ${sectionHead('Sequence Rules')}
              <div class="space-y-1.5">
                <label class="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" name="require_prev_completed" class="mt-0.5 rounded shrink-0" ${template?.require_prev_completed ? 'checked' : ''} />
                  <span class="text-xs text-gray-700">Require prev. completed</span>
                </label>
                <label class="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" name="enforce_date_order" class="mt-0.5 rounded shrink-0" ${template?.enforce_date_order ? 'checked' : ''} />
                  <span class="text-xs text-gray-700">Enforce date order</span>
                </label>
              </div>
            </div>

            <div>
              ${sectionHead('Milestone Owner')}
              <div class="max-h-32 overflow-y-auto space-y-0.5">${contactsRoleHtml('milestone_owner')}</div>
            </div>

            <div>
              ${sectionHead('CS Owner')}
              <div class="max-h-32 overflow-y-auto space-y-0.5">${contactsRoleHtml('checksheet_owner')}</div>
            </div>

          </div>

          <!-- COL 3: buttons + visible to + required docs -->
          <div class="space-y-4 border-l pl-4">

            <div class="flex gap-2 justify-end">
              <p id="tpl-error" class="hidden text-xs text-red-600 self-center mr-auto"></p>
              ${btn('Cancel', { variant: 'outline', size: 'sm', cls: 'cancel-tpl-form' })}
              ${btn(isEdit ? 'Save' : 'Add', { type: 'submit', size: 'sm', cls: 'submit-tpl' })}
            </div>

            <div>
              ${sectionHead('Visible to')}
              <div class="max-h-36 overflow-y-auto space-y-0.5">${visibilityHtml()}</div>
            </div>

            <div>
              ${sectionHead('Required Docs')}
              <div id="req-docs-library-list" class="max-h-28 overflow-y-auto space-y-0.5 mb-1">${requiredDocsLibraryHtml()}</div>
              <div id="custom-docs-list" class="space-y-0.5 mb-1.5">${customDocsHtml()}</div>
              <div class="flex gap-1">
                <input type="text" id="new-custom-doc-input" placeholder="Custom doc…" class="flex-1 min-w-0 rounded border border-gray-300 px-2 py-1 text-xs" />
                <button type="button" id="add-custom-doc-to-lib" title="Add &amp; save to library" class="shrink-0 px-1.5 py-1 text-xs rounded border border-gray-300 bg-white hover:bg-gray-50">📚</button>
                <button type="button" id="add-custom-doc-only" title="This template only" class="shrink-0 px-1.5 py-1 text-xs rounded border border-gray-300 bg-white hover:bg-gray-50">+</button>
              </div>
              <p id="req-doc-error" class="hidden text-xs text-red-600 mt-1"></p>
            </div>

          </div>
        </div>
      </form>` })

    dlg2.querySelector('.cancel-tpl-form').onclick = () => closeModal('tpl-form-modal')

    async function openItemPhotoModal(label, itemId, triggerBtn) {
      function sanitizeFilename(name) {
        return name.replace(/[–—]/g, '-').replace(/[^\w\s.\-_()]/g, '').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
      }

      const { data: photos } = await db.from('milestone_template_item_photos')
        .select('*').eq('item_id', itemId).order('uploaded_at')

      const signedPhotos = await Promise.all((photos ?? []).map(async p => {
        const { data } = await db.storage.from('Documents').createSignedUrl(p.file_path, 3600)
        return { ...p, signedUrl: data?.signedUrl }
      }))

      const thumbsHtml = signedPhotos.map(p => `
        <div class="relative group">
          <a href="${p.signedUrl}" target="_blank" class="block">
            <img src="${p.signedUrl}" alt="${p.filename}"
              class="w-full h-28 object-cover rounded-lg border border-gray-200 hover:border-blue-300 transition-colors" />
          </a>
          <button class="del-tpl-photo absolute top-1 right-1 bg-white/90 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity"
            data-photo-id="${p.id}" data-path="${p.file_path}">${icons.trash}</button>
          <p class="text-xs text-gray-400 truncate mt-1">${p.filename}</p>
        </div>`).join('')

      const photoDlg = showModal({ id: 'tpl-photo-modal', title: `Reference photos — ${label}`, size: 'lg', body: `
        <div>
          ${signedPhotos.length > 0
            ? `<div class="grid grid-cols-3 gap-3 mb-4">${thumbsHtml}</div>`
            : `<p class="text-sm text-gray-400 text-center py-6 mb-2">No photos yet.</p>`}
          <label class="flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-gray-200 px-4 py-5 cursor-pointer hover:border-blue-300 hover:bg-blue-50/40 transition-colors">
            <input type="file" class="hidden tpl-photo-input" multiple accept="image/*" />
            <span class="text-gray-300">${icons.upload}</span>
            <span class="text-xs text-gray-400">Add photos — <span class="text-blue-600">click to browse</span></span>
          </label>
          <p id="tpl-photo-error" class="hidden text-sm text-red-600 mt-2"></p>
          <div class="flex justify-end pt-3">
            ${btn('Close', { variant: 'outline', cls: 'close-tpl-photo' })}
          </div>
        </div>` })

      photoDlg.querySelector('.close-tpl-photo')?.addEventListener('click', () => closeModal('tpl-photo-modal'))

      async function refreshBadge() {
        const { data: fresh } = await db.from('milestone_template_item_photos').select('id').eq('item_id', itemId)
        const count = fresh?.length ?? 0
        // Update badge on the button in the form
        const entry = itemList.find(i => i.id === itemId)
        if (entry) entry.photoCount = count
        if (triggerBtn) {
          triggerBtn.className = triggerBtn.className.replace(/text-(?:blue-500 hover:text-blue-700|gray-300 hover:text-gray-500)/, count > 0 ? 'text-blue-500 hover:text-blue-700' : 'text-gray-300 hover:text-gray-500')
          triggerBtn.innerHTML = `${icons.camera.replace('h-4 w-4','h-3.5 w-3.5')}${count > 0 ? `<span class="text-xs">${count}</span>` : ''}`
        }
      }

      photoDlg.querySelector('.tpl-photo-input')?.addEventListener('change', async function() {
        const files = [...(this.files ?? [])]; if (!files.length) return
        const errEl = photoDlg.querySelector('#tpl-photo-error')
        errEl?.classList.add('hidden'); this.disabled = true
        for (const file of files) {
          const safeName = sanitizeFilename(file.name)
          const filePath = `template-item-photos/${itemId}/${Date.now()}_${safeName}`
          const { error: uploadErr } = await db.storage.from('Documents').upload(filePath, file)
          if (uploadErr) { if (errEl) { errEl.textContent = uploadErr.message; errEl.classList.remove('hidden') } this.disabled = false; return }
          const { error: insErr } = await db.from('milestone_template_item_photos').insert({
            item_id: itemId, file_path: filePath, filename: file.name, uploaded_by: auth.profile?.id ?? null,
          })
          if (insErr) { if (errEl) { errEl.textContent = insErr.message; errEl.classList.remove('hidden') } this.disabled = false; return }
        }
        closeModal('tpl-photo-modal')
        await refreshBadge()
        await openItemPhotoModal(label, itemId, triggerBtn)
      })

      photoDlg.querySelectorAll('.del-tpl-photo').forEach(b => {
        b.addEventListener('click', async () => {
          if (!confirm('Delete this photo?')) return
          b.disabled = true
          await db.storage.from('Documents').remove([b.dataset.path])
          await db.from('milestone_template_item_photos').delete().eq('id', b.dataset.photoId)
          closeModal('tpl-photo-modal')
          await refreshBadge()
          await openItemPhotoModal(label, itemId, triggerBtn)
        })
      })
    }

    // Required docs — custom add buttons
    renderCustomDocs(dlg2)
    dlg2.querySelector('#add-custom-doc-to-lib').onclick = async () => {
      const input = dlg2.querySelector('#new-custom-doc-input')
      const errEl = dlg2.querySelector('#req-doc-error')
      const name = input.value.trim()
      errEl.classList.add('hidden')
      if (!name) return
      const btn2 = dlg2.querySelector('#add-custom-doc-to-lib')
      btn2.disabled = true; btn2.textContent = '…'
      const { data, error } = await db.from('document_types').insert({ name }).select('id, name').single()
      if (error) {
        errEl.textContent = error.message.includes('unique') ? `"${name}" already in library.` : error.message
        errEl.classList.remove('hidden')
        btn2.disabled = false; btn2.textContent = '📚'
        return
      }
      allDocTypes.push(data)
      allDocTypes.sort((a, b) => a.name.localeCompare(b.name))
      checkedLibraryIds.add(data.id)
      dlg2.querySelector('#req-docs-library-list').innerHTML = requiredDocsLibraryHtml()
      input.value = ''
      btn2.disabled = false; btn2.textContent = '📚'
    }
    dlg2.querySelector('#add-custom-doc-only').onclick = () => {
      const input = dlg2.querySelector('#new-custom-doc-input')
      const errEl = dlg2.querySelector('#req-doc-error')
      const name = input.value.trim()
      errEl.classList.add('hidden')
      if (!name) return
      customDocs.push({ custom_name: name })
      renderCustomDocs(dlg2)
      input.value = ''
    }

    function bindItems() {
      dlg2.querySelectorAll('.remove-item').forEach(b => {
        b.onclick = () => { itemList.splice(parseInt(b.dataset.idx), 1); refreshItems() }
      })
      dlg2.querySelectorAll('.item-question').forEach((inp, i) => {
        inp.oninput = () => { itemList[i].question = inp.value }
      })
      dlg2.querySelectorAll('.item-photo-btn').forEach(b => {
        b.onclick = () => openItemPhotoModal(b.dataset.label || 'Item', b.dataset.itemId, b)
      })
    }
    function refreshItems() {
      const c = dlg2.querySelector('#items-container')
      c.innerHTML = itemList.length ? itemsHtml() : '<p class="text-xs text-gray-400 italic px-1">No items yet</p>'
      bindItems()
    }
    dlg2.querySelector('#add-item-btn').onclick = () => {
      itemList.push({ question: '', sort_order: itemList.length })
      refreshItems()
      dlg2.querySelectorAll('.item-question')[itemList.length - 1]?.focus()
    }
    bindItems()

    dlg2.querySelector('#tpl-form').onsubmit = async (e) => {
      e.preventDefault()
      const fd = new FormData(e.target)
      const submitBtn = dlg2.querySelector('.submit-tpl'); submitBtn.disabled = true; submitBtn.textContent = 'Saving…'
      const errEl = dlg2.querySelector('#tpl-error')

      const payload = {
        product_id: productId,
        name: fd.get('name'),
        category: fd.get('category') || null,
        factory_company_id: fd.get('factory_company_id') || null,
        sort_order: parseInt(fd.get('sort_order')) || 0,
        require_prev_completed: fd.get('require_prev_completed') === 'on',
        enforce_date_order: fd.get('enforce_date_order') === 'on',
      }

      let tplId = template?.id
      if (isEdit) {
        const { error } = await db.from('milestone_templates').update(payload).eq('id', tplId)
        if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); submitBtn.disabled = false; submitBtn.textContent = 'Save'; return }
      } else {
        const { data, error } = await db.from('milestone_templates').insert(payload).select('id').single()
        if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); submitBtn.disabled = false; submitBtn.textContent = 'Add'; return }
        tplId = data.id
      }

      // Sync checksheet items: preserve IDs so linked photos survive
      const validItems = itemList.filter(i => i.question.trim())
      const keptIds = new Set(validItems.filter(i => i.id).map(i => i.id))
      const toDeleteIds = items.filter(i => !keptIds.has(i.id)).map(i => i.id)
      if (toDeleteIds.length) await db.from('milestone_template_items').delete().in('id', toDeleteIds)
      for (const [idx, item] of validItems.entries()) {
        if (item.id) {
          await db.from('milestone_template_items').update({ question: item.question.trim(), sort_order: idx }).eq('id', item.id)
        } else {
          await db.from('milestone_template_items').insert({ template_id: tplId, question: item.question.trim(), sort_order: idx })
        }
      }

      // Sync visible companies: delete all + re-insert
      const checkedIds = Array.from(dlg2.querySelectorAll('.vis-check:checked')).map(cb => cb.value)
      await db.from('milestone_template_companies').delete().eq('template_id', tplId)
      if (checkedIds.length) {
        await db.from('milestone_template_companies').insert(checkedIds.map(cid => ({ template_id: tplId, company_id: cid })))
      }

      // Sync template contacts: delete all + re-insert
      await db.from('milestone_template_contacts').delete().eq('template_id', tplId)
      const contactRows = []
      dlg2.querySelectorAll('.contact-check:checked').forEach(cb => {
        contactRows.push({ template_id: tplId, user_id: cb.value, role: cb.dataset.role })
      })
      if (contactRows.length) {
        await db.from('milestone_template_contacts').insert(contactRows)
      }

      // Sync required docs: delete all + re-insert
      await db.from('milestone_template_required_docs').delete().eq('template_id', tplId)
      const reqDocRows = []
      dlg2.querySelectorAll('.req-doc-check:checked').forEach(cb => {
        reqDocRows.push({ template_id: tplId, document_type_id: cb.value })
      })
      for (const cd of customDocs) {
        if (cd.custom_name) reqDocRows.push({ template_id: tplId, custom_name: cd.custom_name })
      }
      if (reqDocRows.length) {
        await db.from('milestone_template_required_docs').insert(reqDocRows)
      }

      closeModal('tpl-form-modal')
      await onSave()
    }
  }

  function openDeleteTemplate(tplId, tplName, onSave) {
    const dlg = showModal({ id: 'del-tpl-modal', title: 'Delete Milestone', body: `
      <p class="text-sm text-gray-600 mb-4">Delete milestone <strong>${tplName}</strong> and all its checksheet items? This cannot be undone.</p>
      <div class="flex justify-end gap-2">
        ${btn('Cancel', { variant: 'outline', cls: 'cancel-del' })}
        ${btn('Delete', { variant: 'destructive', cls: 'confirm-del' })}
      </div>` })
    dlg.querySelector('.cancel-del').onclick = () => closeModal('del-tpl-modal')
    dlg.querySelector('.confirm-del').onclick = async () => {
      await db.from('milestone_templates').delete().eq('id', tplId)
      closeModal('del-tpl-modal')
      await onSave()
    }
  }

  async function load() {
    const { data } = await db.from('products').select('*, product_variants(id, name), customer_company:companies!products_customer_company_id_fkey(id, name)').order('name')
    return data ?? []
  }

  function renderTable(products) {
    const rows = products.map(p => {
      const variantRows = expanded[p.id] ? (p.product_variants ?? []).map(v => `
        <tr class="bg-gray-50">
          <td class="px-4 py-2 pl-10 text-gray-600" colspan="2">↳ ${v.name}</td>
          <td class="px-4 py-2"></td>
          <td class="px-4 py-2"><div class="flex items-center gap-1 justify-end">
            <button class="p-1 text-gray-400 hover:text-gray-700 edit-var" data-vid="${v.id}" data-pid="${p.id}">${icons.pencil.replace('h-4 w-4', 'h-3.5 w-3.5')}</button>
            <button class="p-1 text-gray-400 hover:text-red-500 del-var" data-vid="${v.id}" data-vname="${v.name}">${icons.trash.replace('h-4 w-4', 'h-3.5 w-3.5')}</button>
          </div></td>
        </tr>`).join('') : ''

      const chevron = (p.product_variants?.length > 0) ? (expanded[p.id] ? icons.chevronDown : icons.chevronRight) : '<span class="w-4 inline-block"></span>'
      return `<tr class="hover:bg-gray-50">
        <td class="px-4 py-3 font-medium">
          <button class="flex items-center gap-1 text-left toggle-expand" data-id="${p.id}">${chevron} ${p.name}</button>
        </td>
        <td class="px-4 py-3 text-gray-500">${p.description ?? '—'}</td>
        <td class="px-4 py-3 text-gray-500 text-sm">${p.internal ? badge('Internal', 'warning') : p.customer_company?.name ?? '<span class="text-gray-300">All</span>'}</td>
        <td class="px-4 py-3 text-gray-500">
          <button class="flex items-center gap-1 text-gray-500 hover:text-gray-800 text-xs add-var" data-pid="${p.id}">
            ${icons.plus.replace('h-4 w-4', 'h-3 w-3')}
            ${p.product_variants?.length > 0 ? `${p.product_variants.length} variant${p.product_variants.length > 1 ? 's' : ''}` : 'Add variant'}
          </button>
        </td>
        <td class="px-4 py-3">
          <button class="text-xs text-gray-500 hover:text-gray-800 ms-tpl-btn" data-pid="${p.id}">Milestones</button>
        </td>
        <td class="px-4 py-3"><div class="flex items-center gap-1 justify-end">
          <button class="p-1 text-gray-400 hover:text-gray-700 edit-prod" data-id="${p.id}">${icons.pencil}</button>
          <button class="p-1 text-gray-400 hover:text-red-500 del-prod" data-id="${p.id}" data-name="${p.name}">${icons.trash}</button>
        </div></td>
      </tr>${variantRows}`
    }).join('')

    container.innerHTML = `<div class="p-6 page-enter">
      ${pageHeader('Products', btn(`${icons.plus} New Product`, { size: 'sm', cls: 'new-btn' }))}
      ${products.length ? tableWrap(['Name','Description','Customer','Variants','Milestones',''], rows) : '<p class="text-sm text-gray-400">No products yet.</p>'}
    </div>`

    container.querySelector('.new-btn').onclick = () => openProductForm(null)
    container.querySelectorAll('.toggle-expand').forEach(b => {
      b.onclick = () => { expanded[b.dataset.id] = !expanded[b.dataset.id]; renderTable(products) }
    })
    container.querySelectorAll('.edit-prod').forEach(b => b.onclick = () => openProductForm(products.find(p => p.id === b.dataset.id)))
    container.querySelectorAll('.del-prod').forEach(b => b.onclick = () => openDeleteProduct(products.find(p => p.id === b.dataset.id)))
    container.querySelectorAll('.add-var').forEach(b => b.onclick = () => { expanded[b.dataset.pid] = true; openVariantForm(null, b.dataset.pid) })
    container.querySelectorAll('.ms-tpl-btn').forEach(b => {
      b.onclick = () => openMilestoneTemplates(products.find(p => p.id === b.dataset.pid))
    })
    container.querySelectorAll('.edit-var').forEach(b => {
      b.onclick = () => {
        const prod = products.find(p => p.id === b.dataset.pid)
        const variant = prod?.product_variants?.find(v => v.id === b.dataset.vid)
        if (variant) openVariantForm(variant, b.dataset.pid)
      }
    })
    container.querySelectorAll('.del-var').forEach(b => b.onclick = () => openDeleteVariant(b.dataset.vid, b.dataset.vname))
  }

  async function openProductForm(product) {
    editingProduct = product
    const { data: customerCos } = await db.from('companies').select('id, name').eq('type', 'customer').order('name')
    const currentVisibility = product?.internal ? 'internal' : (product?.customer_company_id ?? '')
    const customerOpts = (customerCos ?? []).map(c =>
      `<option value="${c.id}" ${product?.customer_company_id === c.id && !product?.internal ? 'selected' : ''}>${c.name}</option>`
    ).join('')
    const dlg = showModal({ id: 'prod-modal', title: product ? 'Edit Product' : 'New Product', body: `
      <form id="prod-form" class="space-y-4">
        ${formField('Name', `<input name="name" value="${product?.name ?? ''}" required class="${inputCls()}" />`)}
        ${formField('Description', `<input name="description" value="${product?.description ?? ''}" class="${inputCls()}" />`)}
        ${formField('Visibility',
          `<select name="visibility" class="${inputCls()}">
            <option value="" ${currentVisibility === '' ? 'selected' : ''}>All customers</option>
            <option value="internal" ${currentVisibility === 'internal' ? 'selected' : ''}>Internal (system mgr only)</option>
            <optgroup label="Specific customer">${customerOpts}</optgroup>
          </select>`)}
        <p id="prod-error" class="hidden text-sm text-red-600"></p>
        <div class="flex justify-end gap-2 pt-2">
          ${btn('Cancel', { variant: 'outline', cls: 'cancel-btn' })}
          ${btn(product ? 'Save' : 'Create', { type: 'submit', cls: 'submit-btn' })}
        </div>
      </form>` })
    dlg.querySelector('.cancel-btn').onclick = () => closeModal('prod-modal')
    dlg.querySelector('#prod-form').onsubmit = async (e) => {
      e.preventDefault()
      const fd = new FormData(e.target)
      const visibility = fd.get('visibility')
      const payload = {
        name: fd.get('name'),
        description: fd.get('description') || null,
        internal: visibility === 'internal',
        customer_company_id: (visibility === '' || visibility === 'internal') ? null : visibility,
      }
      const submitBtn = dlg.querySelector('.submit-btn'); submitBtn.disabled = true; submitBtn.textContent = 'Saving…'
      const { error } = editingProduct ? await db.from('products').update(payload).eq('id', editingProduct.id) : await db.from('products').insert(payload)
      if (error) { dlg.querySelector('#prod-error').textContent = error.message; dlg.querySelector('#prod-error').classList.remove('hidden'); submitBtn.disabled = false; submitBtn.textContent = editingProduct ? 'Save' : 'Create'; return }
      closeModal('prod-modal'); renderTable(await load())
    }
  }

  function openDeleteProduct(product) {
    const dlg = showModal({ id: 'del-prod-modal', title: 'Delete Product', body: `
      <p class="text-sm text-gray-600 mb-4">Delete <strong>${product.name}</strong> and all its variants? This cannot be undone.</p>
      <p id="del-prod-error" class="hidden text-sm text-red-600 mb-3"></p>
      <div class="flex justify-end gap-2">
        ${btn('Cancel', { variant: 'outline', cls: 'cancel-del' })}
        ${btn('Delete', { variant: 'destructive', cls: 'confirm-del' })}
      </div>` })
    dlg.querySelector('.cancel-del').onclick = () => closeModal('del-prod-modal')
    dlg.querySelector('.confirm-del').onclick = async () => {
      const confirmBtn = dlg.querySelector('.confirm-del')
      const errEl = dlg.querySelector('#del-prod-error')
      confirmBtn.disabled = true; confirmBtn.textContent = 'Deleting…'

      // Check for existing orders first
      const { count } = await db.from('orders').select('id', { count: 'exact', head: true }).eq('product_id', product.id)
      if (count > 0) {
        errEl.textContent = `Cannot delete — this product has ${count} order${count !== 1 ? 's' : ''}. Delete the orders first.`
        errEl.classList.remove('hidden')
        confirmBtn.disabled = false; confirmBtn.textContent = 'Delete'
        return
      }

      const { error } = await db.from('products').delete().eq('id', product.id)
      if (error) {
        errEl.textContent = error.message
        errEl.classList.remove('hidden')
        confirmBtn.disabled = false; confirmBtn.textContent = 'Delete'
        return
      }
      closeModal('del-prod-modal')
      renderTable(await load())
    }
  }

  function openVariantForm(variant, productId) {
    editingVariant = variant; variantProductId = productId
    const dlg = showModal({ id: 'var-modal', title: variant ? 'Edit Variant' : 'New Variant', body: `
      <form id="var-form" class="space-y-4">
        ${formField('Variant Name', `<input name="name" value="${variant?.name ?? ''}" required placeholder="e.g. Misty Rose" class="${inputCls()}" />`)}
        <p id="var-error" class="hidden text-sm text-red-600"></p>
        <div class="flex justify-end gap-2 pt-2">
          ${btn('Cancel', { variant: 'outline', cls: 'cancel-btn' })}
          ${btn(variant ? 'Save' : 'Add', { type: 'submit', cls: 'submit-btn' })}
        </div>
      </form>` })
    dlg.querySelector('.cancel-btn').onclick = () => closeModal('var-modal')
    dlg.querySelector('#var-form').onsubmit = async (e) => {
      e.preventDefault()
      const fd = new FormData(e.target)
      const submitBtn = dlg.querySelector('.submit-btn'); submitBtn.disabled = true; submitBtn.textContent = 'Saving…'
      const { error } = editingVariant
        ? await db.from('product_variants').update({ name: fd.get('name') }).eq('id', editingVariant.id)
        : await db.from('product_variants').insert({ product_id: variantProductId, name: fd.get('name') })
      if (error) { dlg.querySelector('#var-error').textContent = error.message; dlg.querySelector('#var-error').classList.remove('hidden'); submitBtn.disabled = false; submitBtn.textContent = editingVariant ? 'Save' : 'Add'; return }
      closeModal('var-modal'); renderTable(await load())
    }
  }

  function openDeleteVariant(variantId, variantName) {
    const dlg = showModal({ id: 'del-var-modal', title: 'Delete Variant', body: `
      <p class="text-sm text-gray-600 mb-4">Delete variant <strong>${variantName}</strong>? This cannot be undone.</p>
      <div class="flex justify-end gap-2">
        ${btn('Cancel', { variant: 'outline', cls: 'cancel-del' })}
        ${btn('Delete', { variant: 'destructive', cls: 'confirm-del' })}
      </div>` })
    dlg.querySelector('.cancel-del').onclick = () => closeModal('del-var-modal')
    dlg.querySelector('.confirm-del').onclick = async () => {
      await db.from('product_variants').delete().eq('id', variantId); closeModal('del-var-modal'); renderTable(await load())
    }
  }

  renderTable(await load())
}
