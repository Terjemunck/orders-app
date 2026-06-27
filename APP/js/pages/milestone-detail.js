window.render_milestoneDetail = async function(container, orderId, milestoneId) {
  container.innerHTML = '<div class="p-6 text-sm text-gray-400">Loading…</div>'
  const canEdit = auth.companyType === 'system_mgr' || auth.companyType === 'factory'
  const isMgr = auth.companyType === 'system_mgr'

  async function load() {
    const [{ data: ms }, { data: docs }, { data: visibleCos }, { data: contacts }, { data: requiredDocs }] = await Promise.all([
      db.from('milestones')
        .select('*, factory:companies!milestones_factory_company_id_fkey(name), order:orders(product:products(name), customer:companies!orders_customer_company_id_fkey(name))')
        .eq('id', milestoneId).single(),
      db.from('documents').select('*').eq('milestone_id', milestoneId).order('uploaded_at', { ascending: false }),
      db.from('milestone_visible_companies').select('company_id, company:companies(id, name)').eq('milestone_id', milestoneId),
      db.from('milestone_contacts').select('user_id, role, user:users(id, name, email)').eq('milestone_id', milestoneId),
      db.from('milestone_required_docs')
        .select('*, document_type:document_types(id, name), document:documents(id, filename, file_path, uploaded_at)')
        .eq('milestone_id', milestoneId).order('created_at'),
    ])
    if (!ms) return { milestone: null, items: [], responses: [], docs: [], visibleCos: [], contacts: [], requiredDocs: [] }

    let items = []
    if (ms.template_id) {
      const { data: tplItems } = await db.from('milestone_template_items')
        .select('*').eq('template_id', ms.template_id).order('sort_order')
      items = tplItems ?? []
    }

    const { data: responses } = await db.from('checksheet_responses')
      .select('*, answered_by_user:users(name)')
      .eq('milestone_id', milestoneId)

    const { data: extraItems } = await db.from('milestone_extra_items')
      .select('*').eq('milestone_id', milestoneId).order('sort_order')

    let responsePhotos = []
    if (responses?.length) {
      const { data: photosData } = await db.from('checksheet_response_photos')
        .select('*')
        .in('response_id', responses.map(r => r.id))
      responsePhotos = photosData ?? []
    }

    let templateItemPhotos = {}
    if (items.length) {
      const { data: tplPhotos } = await db.from('milestone_template_item_photos')
        .select('item_id').in('item_id', items.map(i => i.id))
      for (const p of tplPhotos ?? []) {
        templateItemPhotos[p.item_id] = (templateItemPhotos[p.item_id] ?? 0) + 1
      }
    }

    return { milestone: ms, items, responses: responses ?? [], docs: docs ?? [], visibleCos: visibleCos ?? [], contacts: contacts ?? [], requiredDocs: requiredDocs ?? [], extraItems: extraItems ?? [], responsePhotos, templateItemPhotos }
  }

  function sanitizeFilename(name) {
    return name
      .replace(/[–—]/g, '-')
      .replace(/[^\w\s.\-_()]/g, '')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
  }

  function renderPage({ milestone, items, responses, docs, visibleCos, contacts, requiredDocs, extraItems, responsePhotos, templateItemPhotos }) {
    if (!milestone) { container.innerHTML = '<div class="p-6 text-sm text-gray-500">Milestone not found.</div>'; return }

    const requiredDocIds = new Set(requiredDocs.filter(rd => rd.document_id).map(rd => rd.document_id))
    const additionalDocs = docs.filter(d => !requiredDocIds.has(d.id))

    const productName = milestone.order?.product?.name ?? ''
    const customerName = milestone.order?.customer?.name ?? ''
    const allTemplateYes = items.every(item => responses.find(r => r.item_id === item.id)?.answer === true)
    const allExtraYes = extraItems.every(item => responses.find(r => r.extra_item_id === item.id)?.answer === true)
    const totalItems = items.length + extraItems.length
    const allYes = totalItems === 0 || (allTemplateYes && allExtraYes)
    const answeredCount = items.filter(item => responses.find(r => r.item_id === item.id)?.answer === true).length
                        + extraItems.filter(item => responses.find(r => r.extra_item_id === item.id)?.answer === true).length
    const allRequiredDocsUploaded = requiredDocs.every(rd => rd.document_id != null)
    const canComplete = canEdit && !milestone.completed && (totalItems === 0 || allYes) && allRequiredDocsUploaded


    const canUpload = canEdit && !milestone.completed

    const blockers = []
    if (totalItems > 0 && !allYes) blockers.push('All checksheet items must be YES')
    if (requiredDocs.length > 0 && !allRequiredDocsUploaded) blockers.push(`${requiredDocs.filter(rd => !rd.document_id).length} required doc(s) missing`)

    const completeBtnHtml = canEdit && !milestone.completed ? `
      <div class="flex items-center gap-3 border-t pt-3 mt-1">
        <p id="cs-error" class="text-xs text-red-600 hidden flex-1"></p>
        ${blockers.length ? `<p class="text-xs text-gray-400 flex-1">${blockers.join(' · ')}</p>` : '<span class="flex-1"></span>'}
        <button id="complete-ms-btn" class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40" ${canComplete ? '' : 'disabled'}>
          Mark Complete
        </button>
      </div>` : ''

    const metaParts = [productName, customerName, milestone.category, milestone.factory?.name].filter(Boolean)

    function statusBadge() {
      if (milestone.completed) return badge('Completed', 'success')
      if (milestone.start_date) return badge('In Progress', 'info')
      return badge('Pending', 'outline')
    }

    const startBtn = canEdit && !milestone.start_date && !milestone.completed
      ? `<button id="start-ms-btn" class="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-gray-900 text-white hover:bg-gray-700">${icons.play} Start Milestone</button>`
      : ''

    const reopenBtn = isMgr && milestone.completed
      ? `<button id="reopen-ms-btn" class="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-gray-300 bg-white text-gray-600 hover:bg-gray-50">↩ Reopen</button>`
      : ''

    const editTargetBtn = isMgr && !milestone.completed
      ? `<button class="edit-date-btn text-xs text-blue-600 hover:text-blue-800 underline ml-1">${milestone.target_date ? 'edit' : 'set'}</button>`
      : ''

    const historyBtn = `<button class="date-history-btn text-xs text-gray-400 hover:text-gray-600 underline ml-2">history</button>`

    container.innerHTML = `<div class="p-4 page-enter">

      <!-- Header -->
      <div class="flex items-center gap-3 mb-1 flex-wrap">
        <button class="back-btn flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 shrink-0">${icons.arrowLeft}</button>
        <h1 class="text-lg font-semibold">${milestone.name}</h1>
        ${statusBadge()}
        ${startBtn}
        ${reopenBtn}
      </div>
      ${metaParts.length ? `<p class="text-xs text-gray-400 mb-3 ml-7">${metaParts.join(' · ')}</p>` : '<div class="mb-3"></div>'}

      <!-- Date strip -->
      <div class="flex items-center gap-6 mb-4 ml-7 text-sm">
        <span class="text-gray-400">Start <span class="text-gray-700 font-medium ml-1">${milestone.start_date ?? '—'}</span></span>
        <span class="text-gray-300">|</span>
        <span class="text-gray-400">Target <span class="text-gray-700 font-medium ml-1">${milestone.target_date ?? '—'}</span>${editTargetBtn}${historyBtn}</span>
        <span class="text-gray-300">|</span>
        <span class="text-gray-400">Finished <span class="${milestone.actual_date ? 'text-green-700' : 'text-gray-700'} font-medium ml-1">${milestone.actual_date ?? '—'}</span></span>
      </div>

      <!-- Two-column body -->
      <div class="flex gap-4 items-start">

        <!-- LEFT: main work area -->
        <div class="flex-1 min-w-0 space-y-3">

          ${(totalItems > 0 || isMgr) ? `<div class="rounded-lg border bg-white shadow-sm">
            <div class="px-4 py-2.5 border-b flex items-center justify-between">
              <span class="text-sm font-semibold">Checksheet</span>
              <span class="text-xs text-gray-400">${answeredCount}/${totalItems} checked</span>
            </div>
            <div class="divide-y">
              ${items.map(item => {
                const resp = responses.find(r => r.item_id === item.id)
                const checked = resp?.answer ?? false
                const disabled = !canEdit || milestone.completed
                const photoCount = resp ? responsePhotos.filter(p => p.response_id === resp.id).length : 0
                const photoBtn = resp
                  ? `<button class="cs-photo-btn shrink-0 flex items-center gap-1 px-1.5 py-1 rounded ${photoCount > 0 ? 'text-blue-600 hover:text-blue-800' : 'text-gray-300 hover:text-gray-500'}"
                      data-resp-id="${resp.id}" data-label="${item.question.replace(/"/g, '&quot;')}"
                      title="${photoCount > 0 ? photoCount + ' photo(s)' : 'Add photo'}">${icons.camera}${photoCount > 0 ? `<span class="text-xs font-medium">${photoCount}</span>` : ''}</button>`
                  : ''
                const refCount = templateItemPhotos[item.id] ?? 0
                const refBtn = refCount > 0
                  ? `<button class="ref-photo-btn shrink-0 flex items-center gap-1 px-1.5 py-1 rounded text-amber-500 hover:text-amber-700"
                      data-item-id="${item.id}" data-label="${item.question.replace(/"/g, '&quot;')}"
                      title="${refCount} reference photo(s)">${icons.camera}<span class="text-xs font-medium">${refCount}</span></button>`
                  : ''
                return `<div class="flex items-center gap-3 px-4 py-2.5 ${checked ? 'bg-green-50' : ''}">
                  <button type="button" class="toggle-item shrink-0 ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}"
                    data-item-id="${item.id}" data-resp-id="${resp?.id ?? ''}" data-checked="${checked}" ${disabled ? 'disabled' : ''}>
                    ${checked ? `<span class="text-green-600">${icons.check}</span>` : `<span class="text-gray-300">${icons.circle}</span>`}
                  </button>
                  <p class="text-sm flex-1">${item.question}</p>
                  ${refBtn}
                  ${resp?.answered_at ? `<span class="text-xs text-gray-300 shrink-0">${new Date(resp.answered_at).toLocaleDateString()}</span>` : ''}
                  ${photoBtn}
                </div>`
              }).join('')}
              ${extraItems.map(item => {
                const resp = responses.find(r => r.extra_item_id === item.id)
                const checked = resp?.answer ?? false
                const disabled = !canEdit || milestone.completed
                const photoCount = resp ? responsePhotos.filter(p => p.response_id === resp.id).length : 0
                const photoBtn = resp
                  ? `<button class="cs-photo-btn shrink-0 flex items-center gap-1 px-1.5 py-1 rounded ${photoCount > 0 ? 'text-blue-600 hover:text-blue-800' : 'text-gray-300 hover:text-gray-500'}"
                      data-resp-id="${resp.id}" data-label="${item.question.replace(/"/g, '&quot;')}"
                      title="${photoCount > 0 ? photoCount + ' photo(s)' : 'Add photo'}">${icons.camera}${photoCount > 0 ? `<span class="text-xs font-medium">${photoCount}</span>` : ''}</button>`
                  : ''
                return `<div class="flex items-center gap-3 px-4 py-2.5 ${checked ? 'bg-green-50' : ''}">
                  <button type="button" class="toggle-item shrink-0 ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}"
                    data-extra-item-id="${item.id}" data-resp-id="${resp?.id ?? ''}" data-checked="${checked}" ${disabled ? 'disabled' : ''}>
                    ${checked ? `<span class="text-green-600">${icons.check}</span>` : `<span class="text-gray-300">${icons.circle}</span>`}
                  </button>
                  <p class="text-sm flex-1">${item.question}</p>
                  <span class="text-xs text-gray-300 shrink-0 italic">custom</span>
                  ${photoBtn}
                  ${isMgr && !milestone.completed ? `<button class="del-extra-btn shrink-0 p-1 text-gray-300 hover:text-red-500 rounded ml-1" data-extra-id="${item.id}">${icons.trash}</button>` : ''}
                </div>`
              }).join('')}
              ${isMgr && !milestone.completed ? `<div class="flex items-center gap-2 px-4 py-2.5 bg-gray-50">
                <input id="extra-q-input" type="text" placeholder="Add a custom question…"
                  class="flex-1 text-sm rounded border border-gray-200 px-2 py-1.5 outline-none focus:border-blue-400" />
                <button id="add-extra-btn" class="shrink-0 px-3 py-1.5 text-xs font-medium rounded bg-gray-900 text-white hover:bg-gray-700">Add</button>
              </div>` : ''}
            </div>
            ${completeBtnHtml ? `<div class="px-4 pb-3">${completeBtnHtml}</div>` : ''}
          </div>` : (canEdit && !milestone.completed ? `<div class="rounded-lg border bg-white shadow-sm px-4 py-3">${completeBtnHtml}</div>` : '')}

          ${requiredDocs.length > 0 ? `<div class="rounded-lg border bg-white shadow-sm">
            <div class="px-4 py-2.5 border-b flex items-center justify-between">
              <span class="text-sm font-semibold">Required Documents</span>
              <span class="text-xs ${requiredDocs.every(rd => rd.document_id) ? 'text-green-600' : 'text-gray-400'}">${requiredDocs.filter(rd => rd.document_id).length}/${requiredDocs.length} uploaded</span>
            </div>
            <div class="divide-y">
              ${requiredDocs.map(rd => {
                const label = rd.document_type?.name ?? rd.custom_name ?? 'Document'
                const uploaded = !!rd.document_id
                if (uploaded) {
                  return `<div class="flex items-center gap-3 px-4 py-2 bg-green-50">
                    <span class="shrink-0 text-green-600">${icons.check}</span>
                    <span class="text-sm flex-1">${label}</span>
                    <div class="flex items-center gap-1 shrink-0">
                      <button class="open-req-doc text-xs text-blue-600 hover:underline" data-path="${rd.document?.file_path}">${rd.document?.filename ?? 'View'}</button>
                      ${isMgr ? `<button class="del-req-doc-btn p-1 text-gray-300 hover:text-red-500 rounded" data-rd-id="${rd.id}" data-doc-id="${rd.document_id}" data-path="${rd.document?.file_path}">${icons.trash}</button>` : ''}
                    </div>
                  </div>`
                }
                if (canUpload) {
                  return `<div class="px-4 py-3 req-doc-row" data-rd-id="${rd.id}">
                    <div class="flex items-center gap-2 mb-2">
                      <span class="text-gray-300 shrink-0">${icons.circle}</span>
                      <span class="text-sm">${label}</span>
                    </div>
                    <label class="cursor-pointer block">
                      <input type="file" class="hidden req-doc-upload" data-rd-id="${rd.id}" />
                      <span class="req-doc-upload-span flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-200 px-4 py-4 hover:border-blue-300 hover:bg-blue-50/40 transition-colors">
                        <span class="text-gray-300">${icons.upload}</span>
                        <span class="text-xs text-gray-400">Drop file here or <span class="text-blue-600">click to browse</span></span>
                      </span>
                    </label>
                  </div>`
                }
                return `<div class="flex items-center gap-3 px-4 py-2">
                  <span class="shrink-0 text-gray-300">${icons.circle}</span>
                  <span class="text-sm flex-1">${label}</span>
                  <span class="text-xs text-gray-400 shrink-0">Missing</span>
                </div>`
              }).join('')}
            </div>
          </div>` : ''}

          <div class="rounded-lg border bg-white shadow-sm">
            <div class="px-4 py-2.5 border-b flex items-center justify-between">
              <span class="text-sm font-semibold">Notes</span>
              <span id="notes-saved" class="text-xs text-green-600 hidden">Saved</span>
            </div>
            <div class="p-4">
              ${canEdit
                ? `<textarea id="notes-field" rows="3" placeholder="Add a comment or note…" class="w-full text-sm rounded-md border border-gray-200 px-3 py-2 outline-none focus:border-blue-400 resize-none">${milestone.notes ?? ''}</textarea>`
                : `<p class="text-sm text-gray-600 whitespace-pre-wrap">${milestone.notes ? milestone.notes : '<span class="text-gray-400 italic">No notes.</span>'}</p>`}
            </div>
          </div>

          <div class="rounded-lg border bg-white shadow-sm">
            <div class="px-4 py-2.5 border-b">
              <span class="text-sm font-semibold">${requiredDocs.length > 0 ? 'Additional Documents' : 'Documents'}</span>
            </div>
            <div class="p-4 space-y-3">
              ${additionalDocs.length > 0 ? `<div class="space-y-1.5">${additionalDocs.map(d => `<div class="flex items-center gap-1 rounded border px-3 py-2 text-xs hover:bg-gray-50">
      <button class="open-doc flex items-center gap-2 flex-1 text-left min-w-0" data-path="${d.file_path}" data-id="${d.id}">
        ${icons.file}<span class="flex-1 truncate">${d.filename}</span>
        <span class="text-gray-400 shrink-0">${new Date(d.uploaded_at).toLocaleDateString()}</span>
      </button>
      ${isMgr ? `<button class="del-doc-btn shrink-0 p-1 text-gray-300 hover:text-red-500 rounded ml-1" data-id="${d.id}" data-path="${d.file_path}">${icons.trash}</button>` : ''}
    </div>`).join('')}</div>` : ''}
              ${canUpload
                ? `<label id="doc-drop-zone" class="flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-gray-200 px-4 py-5 cursor-pointer hover:border-blue-300 hover:bg-blue-50/40 transition-colors">
                    <input type="file" class="hidden doc-upload" multiple />
                    <span class="text-gray-300">${icons.upload}</span>
                    <span class="text-xs text-gray-400">Drop files here or <span class="text-blue-600">click to browse</span></span>
                  </label>`
                : (additionalDocs.length === 0 ? '<p class="text-xs text-gray-400">No documents uploaded.</p>' : '')}
            </div>
          </div>

        </div>

        <!-- RIGHT: sidebar -->
        <div class="w-64 shrink-0 space-y-3">

          <div class="rounded-lg border bg-white shadow-sm">
            <div class="px-4 py-2.5 border-b flex items-center justify-between">
              <span class="text-sm font-semibold">In charge</span>
              ${isMgr ? `<button class="manage-contacts-btn text-xs text-blue-600 hover:text-blue-800">Manage</button>` : ''}
            </div>
            <div class="px-4 py-3 space-y-2">
              ${['milestone_owner', 'checksheet_owner'].map(role => {
                const label = role === 'milestone_owner' ? 'Milestone Owner' : 'CS Owner'
                const names = contacts.filter(c => c.role === role).map(c => c.user?.name ?? c.user?.email ?? '—')
                return `<div>
                  <p class="text-xs text-gray-400 mb-1">${label}</p>
                  ${names.length
                    ? `<div class="flex flex-wrap gap-1">${names.map(n => `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700">${n}</span>`).join('')}</div>`
                    : `<p class="text-xs text-gray-400 italic">None</p>`}
                </div>`
              }).join('')}
            </div>
          </div>

          <div class="rounded-lg border bg-white shadow-sm">
            <div class="px-4 py-2.5 border-b flex items-center justify-between">
              <span class="text-sm font-semibold">Visible to</span>
              ${isMgr ? `<button class="manage-visibility-btn text-xs text-blue-600 hover:text-blue-800">Manage</button>` : ''}
            </div>
            <div class="px-4 py-3">
              ${visibleCos.length
                ? `<div class="flex flex-wrap gap-1">${visibleCos.map(vc => `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">${vc.company?.name ?? '—'}</span>`).join('')}</div>`
                : `<p class="text-xs text-gray-400 italic">${isMgr ? 'Only your team + factory' : 'Not shared'}</p>`}
            </div>
          </div>

          ${isMgr ? `<div class="rounded-lg border bg-white shadow-sm">
            <div class="px-4 py-2.5 border-b">
              <span class="text-sm font-semibold">Sequence Rules</span>
            </div>
            <div class="px-4 py-3 space-y-2">
              <label class="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" id="toggle-req-prev" class="mt-0.5 rounded shrink-0" ${milestone.require_prev_completed ? 'checked' : ''} />
                <span class="text-xs text-gray-700">Require previous milestone completed</span>
              </label>
              <label class="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" id="toggle-date-order" class="mt-0.5 rounded shrink-0" ${milestone.enforce_date_order ? 'checked' : ''} />
                <span class="text-xs text-gray-700">Enforce date order</span>
              </label>
              <p id="seq-rule-error" class="hidden text-xs text-red-600"></p>
            </div>
          </div>` : ''}

        </div>
      </div>
    </div>`

    container.querySelector('.back-btn').onclick = () => navigate(`#/orders/${orderId}`)

    container.querySelectorAll('.toggle-item').forEach(b => {
      b.onclick = async () => {
        if (b.disabled) return
        const newVal = b.dataset.checked !== 'true'
        const now = new Date().toISOString()
        const isExtra = !!b.dataset.extraItemId
        if (b.dataset.respId) {
          await db.from('checksheet_responses').update({ answer: newVal, answered_by: auth.profile.id, answered_at: now }).eq('id', b.dataset.respId)
        } else if (isExtra) {
          await db.from('checksheet_responses').insert({ milestone_id: milestoneId, extra_item_id: b.dataset.extraItemId, answer: newVal, answered_by: auth.profile.id, answered_at: now })
        } else {
          await db.from('checksheet_responses').insert({ milestone_id: milestoneId, item_id: b.dataset.itemId, answer: newVal, answered_by: auth.profile.id, answered_at: now })
        }
        renderPage(await load())
      }
    })

    container.querySelector('#complete-ms-btn')?.addEventListener('click', async () => {
      const errEl = container.querySelector('#cs-error')
      if (totalItems > 0) {
        const d = await load()
        const templateOk = d.items.every(item => d.responses.find(r => r.item_id === item.id)?.answer === true)
        const extraOk = d.extraItems.every(item => d.responses.find(r => r.extra_item_id === item.id)?.answer === true)
        if (!templateOk || !extraOk) { if (errEl) { errEl.textContent = 'All checksheet items must be YES first.'; errEl.classList.remove('hidden') } return }
      }
      const today = new Date().toISOString().split('T')[0]
      const { error } = await db.from('milestones').update({
        completed: true,
        actual_date: today,
        completed_at: new Date().toISOString(),
        completed_by: auth.profile?.id ?? null,
      }).eq('id', milestoneId)
      if (error) { if (errEl) { errEl.textContent = error.message; errEl.classList.remove('hidden') } return }
      // Fire-and-forget: notify contacts
      fetch(`${SUPABASE_URL}/functions/v1/notify-milestone-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ milestone_id: milestoneId }),
      }).catch(err => console.warn('notify-milestone-complete failed:', err))
      renderPage(await load())
    })

    container.querySelector('#start-ms-btn')?.addEventListener('click', async () => {
      const startBtn = container.querySelector('#start-ms-btn')
      startBtn.disabled = true
      startBtn.textContent = 'Starting…'
      const today = new Date().toISOString().split('T')[0]
      const { error } = await db.from('milestones').update({ start_date: today }).eq('id', milestoneId)
      if (error) {
        startBtn.disabled = false
        startBtn.innerHTML = `${icons.play} Start Milestone`
        let errEl = container.querySelector('#start-ms-error')
        if (!errEl) {
          errEl = document.createElement('p')
          errEl.id = 'start-ms-error'
          errEl.className = 'text-xs text-red-600 mt-1'
          startBtn.insertAdjacentElement('afterend', errEl)
        }
        errEl.textContent = error.message
        return
      }
      // Fire-and-forget: notify contacts in charge
      fetch(`${SUPABASE_URL}/functions/v1/notify-milestone-start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ milestone_id: milestoneId }),
      }).catch(err => console.warn('notify-milestone-start failed:', err))
      renderPage(await load())
    })

    container.querySelector('#notes-field')?.addEventListener('blur', async function() {
      const { error } = await db.from('milestones').update({ notes: this.value || null }).eq('id', milestoneId)
      if (!error) {
        const el = container.querySelector('#notes-saved')
        if (el) { el.classList.remove('hidden'); setTimeout(() => el.classList.add('hidden'), 2000) }
      }
    })

    // ── Custom Questions ──────────────────────────────────────────────────────
    const addExtraBtn = container.querySelector('#add-extra-btn')
    const extraQInput = container.querySelector('#extra-q-input')
    if (addExtraBtn && extraQInput) {
      async function addExtraQuestion() {
        const q = extraQInput.value.trim()
        if (!q) return
        addExtraBtn.disabled = true; addExtraBtn.textContent = 'Adding…'
        const nextOrder = (extraItems.length > 0 ? Math.max(...extraItems.map(i => i.sort_order)) : 0) + 1
        const { error } = await db.from('milestone_extra_items').insert({ milestone_id: milestoneId, question: q, sort_order: nextOrder })
        if (error) { alert(error.message) }
        addExtraBtn.disabled = false; addExtraBtn.textContent = 'Add'
        if (!error) renderPage(await load())
      }
      addExtraBtn.addEventListener('click', addExtraQuestion)
      extraQInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addExtraQuestion() } })
    }

    container.querySelectorAll('.del-extra-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this custom question?')) return
        await db.from('milestone_extra_items').delete().eq('id', btn.dataset.extraId)
        renderPage(await load())
      })
    })

    container.querySelectorAll('.cs-photo-btn').forEach(b => {
      b.addEventListener('click', () => openPhotoModal(b.dataset.label, b.dataset.respId, canUpload))
    })

    container.querySelectorAll('.ref-photo-btn').forEach(b => {
      b.addEventListener('click', () => openRefPhotoModal(b.dataset.label, b.dataset.itemId))
    })

    container.querySelector('#reopen-ms-btn')?.addEventListener('click', async () => {
      const btn = container.querySelector('#reopen-ms-btn')
      btn.disabled = true; btn.textContent = 'Reopening…'
      const { error } = await db.from('milestones').update({
        completed: false,
        completed_at: null,
        completed_by: null,
        actual_date: null,
      }).eq('id', milestoneId)
      if (error) { btn.disabled = false; btn.textContent = '↩ Reopen'; alert(error.message); return }
      renderPage(await load())
    })

    container.querySelector('.edit-date-btn')?.addEventListener('click', () => openEditDate(milestone.target_date))
    container.querySelector('.date-history-btn')?.addEventListener('click', () => openDateHistory())

    async function saveSeqRule(field, value) {
      const errEl = container.querySelector('#seq-rule-error')
      const { error } = await db.from('milestones').update({ [field]: value }).eq('id', milestoneId)
      if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden') }
      else errEl.classList.add('hidden')
    }
    container.querySelector('#toggle-req-prev')?.addEventListener('change', e => saveSeqRule('require_prev_completed', e.target.checked))
    container.querySelector('#toggle-date-order')?.addEventListener('change', e => saveSeqRule('enforce_date_order', e.target.checked))

    container.querySelector('.manage-contacts-btn')?.addEventListener('click', () => openManageContacts(contacts))
    container.querySelector('.manage-visibility-btn')?.addEventListener('click', () => openManageVisibility(visibleCos))

    container.querySelectorAll('.open-doc').forEach(b => {
      b.onclick = async () => {
        const { data } = await db.storage.from('Documents').createSignedUrl(b.dataset.path, 3600)
        if (data?.signedUrl) window.open(data.signedUrl, '_blank')
      }
    })

    container.querySelectorAll('.del-doc-btn').forEach(b => {
      b.onclick = async () => {
        if (!confirm(`Delete "${docs.find(d => d.id === b.dataset.id)?.filename}"?`)) return
        b.disabled = true
        await db.storage.from('Documents').remove([b.dataset.path])
        await db.from('documents').delete().eq('id', b.dataset.id)
        renderPage(await load())
      }
    })

    container.querySelectorAll('.open-req-doc').forEach(b => {
      b.onclick = async () => {
        const { data } = await db.storage.from('Documents').createSignedUrl(b.dataset.path, 3600)
        if (data?.signedUrl) window.open(data.signedUrl, '_blank')
      }
    })

    container.querySelectorAll('.del-req-doc-btn').forEach(b => {
      b.onclick = async () => {
        if (!confirm('Remove this document? The requirement slot will remain so you can re-upload.')) return
        b.disabled = true
        await db.storage.from('Documents').remove([b.dataset.path])
        await db.from('documents').delete().eq('id', b.dataset.docId)
        await db.from('milestone_required_docs').update({ document_id: null }).eq('id', b.dataset.rdId)
        renderPage(await load())
      }
    })

    // ── Upload helpers ────────────────────────────────────────────────────────
    async function doUploadDoc(file) {
      const safeName = sanitizeFilename(file.name)
      const filePath = `milestones/${milestoneId}/${Date.now()}_${safeName}`
      const { error: uploadErr } = await db.storage.from('Documents').upload(filePath, file)
      if (uploadErr) throw uploadErr
      const { error: insErr } = await db.from('documents').insert({ milestone_id: milestoneId, filename: file.name, file_path: filePath, document_type: file.type, uploaded_by: auth.profile?.id ?? null })
      if (insErr) throw insErr
    }

    async function doUploadReqDoc(file, rdId, span) {
      const safeName = sanitizeFilename(file.name)
      const filePath = `milestones/${milestoneId}/${Date.now()}_${safeName}`
      if (span) span.textContent = 'Uploading…'
      const { error: uploadErr } = await db.storage.from('Documents').upload(filePath, file)
      if (uploadErr) { alert(uploadErr.message); if (span) span.innerHTML = `${icons.upload} Upload`; return false }
      const { data: docRow, error: insErr } = await db.from('documents').insert({
        milestone_id: milestoneId, filename: file.name, file_path: filePath,
        document_type: file.type, uploaded_by: auth.profile?.id ?? null
      }).select('id').single()
      if (insErr) { alert(insErr.message); if (span) span.innerHTML = `${icons.upload} Upload`; return false }
      await db.from('milestone_required_docs').update({ document_id: docRow.id }).eq('id', rdId)
      return true
    }

    // ── Additional documents: drop zone + click ───────────────────────────────
    const docDropZone = container.querySelector('#doc-drop-zone')
    if (docDropZone) {
      docDropZone.addEventListener('dragover', e => { e.preventDefault(); docDropZone.classList.add('border-blue-400', 'bg-blue-50') })
      docDropZone.addEventListener('dragleave', e => { if (!docDropZone.contains(e.relatedTarget)) docDropZone.classList.remove('border-blue-400', 'bg-blue-50') })
      docDropZone.addEventListener('drop', async e => {
        e.preventDefault()
        docDropZone.classList.remove('border-blue-400', 'bg-blue-50')
        const files = [...(e.dataTransfer?.files ?? [])]
        if (!files.length) return
        for (const file of files) {
          try { await doUploadDoc(file) } catch(err) { alert(err.message); return }
        }
        renderPage(await load())
      })
      container.querySelector('.doc-upload')?.addEventListener('change', async function() {
        const files = [...(this.files ?? [])]; if (!files.length) return
        for (const file of files) {
          try { await doUploadDoc(file) } catch(err) { alert(err.message); return }
        }
        renderPage(await load())
      })
    }

    // ── Required docs: per-row drop + click ───────────────────────────────────
    container.querySelectorAll('.req-doc-row').forEach(row => {
      const rdId = row.dataset.rdId
      const span = row.querySelector('.req-doc-upload-span')
      row.addEventListener('dragover', e => { e.preventDefault(); span?.classList.add('border-blue-300', 'bg-blue-50/40') })
      row.addEventListener('dragleave', e => { if (!row.contains(e.relatedTarget)) span?.classList.remove('border-blue-300', 'bg-blue-50/40') })
      row.addEventListener('drop', async e => {
        e.preventDefault()
        span?.classList.remove('border-blue-300', 'bg-blue-50/40')
        const file = e.dataTransfer?.files?.[0]; if (!file) return
        const ok = await doUploadReqDoc(file, rdId, span)
        if (ok) renderPage(await load())
      })
    })

    container.querySelectorAll('.req-doc-upload').forEach(input => {
      input.addEventListener('change', async function() {
        const file = this.files?.[0]; if (!file) return
        const rdId = this.dataset.rdId
        const span = this.closest('label')?.querySelector('.req-doc-upload-span')
        const ok = await doUploadReqDoc(file, rdId, span)
        if (ok) renderPage(await load())
      })
    })
  }

  async function openManageContacts(currentContacts) {
    const { data: allUsers } = await db.from('users').select('id, name, email, company_id').order('name')
    const byRole = { milestone_owner: new Set(), checksheet_owner: new Set() }
    for (const c of currentContacts) byRole[c.role]?.add(c.user_id)

    function roleListHtml(role) {
      return (allUsers ?? []).map(u => `
        <label class="flex items-center gap-3 px-3 py-2 rounded hover:bg-gray-50 cursor-pointer">
          <input type="checkbox" class="contact-chk rounded" data-role="${role}" value="${u.id}" ${byRole[role]?.has(u.id) ? 'checked' : ''} />
          <span class="text-sm flex-1">${u.name ?? u.email}</span>
          <span class="text-xs text-gray-400">${u.email}</span>
        </label>`).join('')
    }

    const dlg = showModal({ id: 'contacts-modal', title: 'In charge', body: `
      <div class="space-y-4">
        <div>
          <p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Milestone Owner</p>
          <div class="space-y-0.5 max-h-48 overflow-y-auto rounded-md border border-gray-200 bg-gray-50">${roleListHtml('milestone_owner')}</div>
        </div>
        <div>
          <p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Checksheet Owner</p>
          <div class="space-y-0.5 max-h-48 overflow-y-auto rounded-md border border-gray-200 bg-gray-50">${roleListHtml('checksheet_owner')}</div>
        </div>
      </div>
      <p id="contact-error" class="hidden text-sm text-red-600 mt-3"></p>
      <div class="flex justify-end gap-2 mt-4">
        ${btn('Cancel', { variant: 'outline', cls: 'cancel-contacts' })}
        ${btn('Save', { cls: 'save-contacts' })}
      </div>` })

    dlg.querySelector('.cancel-contacts').onclick = () => closeModal('contacts-modal')
    dlg.querySelector('.save-contacts').onclick = async () => {
      const saveBtn = dlg.querySelector('.save-contacts')
      saveBtn.disabled = true; saveBtn.textContent = 'Saving…'
      const errEl = dlg.querySelector('#contact-error')

      const rows = []
      dlg.querySelectorAll('.contact-chk:checked').forEach(cb => {
        rows.push({ milestone_id: milestoneId, user_id: cb.value, role: cb.dataset.role })
      })

      const { error: delErr } = await db.from('milestone_contacts').delete().eq('milestone_id', milestoneId)
      if (delErr) { errEl.textContent = delErr.message; errEl.classList.remove('hidden'); saveBtn.disabled = false; saveBtn.textContent = 'Save'; return }

      if (rows.length) {
        const { error: insErr } = await db.from('milestone_contacts').insert(rows)
        if (insErr) { errEl.textContent = insErr.message; errEl.classList.remove('hidden'); saveBtn.disabled = false; saveBtn.textContent = 'Save'; return }

        // Auto-add each contact's company to milestone_visible_companies
        const contactUsers = (allUsers ?? []).filter(u => rows.some(r => r.user_id === u.id))
        const companyIds = [...new Set(contactUsers.map(u => u.company_id).filter(Boolean))]
        if (companyIds.length) {
          await db.from('milestone_visible_companies').upsert(
            companyIds.map(cid => ({ milestone_id: milestoneId, company_id: cid })),
            { ignoreDuplicates: true }
          )
        }
      }

      closeModal('contacts-modal')
      renderPage(await load())
    }
  }

  async function openManageVisibility(currentVisible) {
    const { data: allCos } = await db.from('companies')
      .select('id, name, type').in('type', ['customer', 'factory']).order('name')

    const currentIds = new Set(currentVisible.map(vc => vc.company_id))

    function listHtml(cos) {
      return (cos ?? []).map(c => `
        <label class="flex items-center gap-3 px-3 py-2 rounded hover:bg-gray-50 cursor-pointer">
          <input type="checkbox" class="visibility-chk rounded" value="${c.id}" ${currentIds.has(c.id) ? 'checked' : ''} />
          <span class="text-sm flex-1">${c.name}</span>
          <span class="text-xs text-gray-400">${c.type}</span>
        </label>`).join('')
    }

    const dlg = showModal({ id: 'visibility-modal', title: 'Visible to', body: `
      <div class="space-y-1 mb-4 max-h-72 overflow-y-auto">${listHtml(allCos)}</div>
      <p id="vis-error" class="hidden text-sm text-red-600 mb-2"></p>
      <div class="flex justify-end gap-2">
        ${btn('Cancel', { variant: 'outline', cls: 'cancel-vis' })}
        ${btn('Save', { cls: 'save-vis' })}
      </div>` })

    dlg.querySelector('.cancel-vis').onclick = () => closeModal('visibility-modal')
    dlg.querySelector('.save-vis').onclick = async () => {
      const saveBtn = dlg.querySelector('.save-vis')
      saveBtn.disabled = true; saveBtn.textContent = 'Saving…'
      const selected = [...dlg.querySelectorAll('.visibility-chk:checked')].map(el => el.value)

      // If companies are being removed, check if any of their users are milestone contacts
      const removedIds = [...currentIds].filter(id => !selected.includes(id))
      if (removedIds.length) {
        const { data: allContacts } = await db.from('milestone_contacts')
          .select('user_id, role, user:users(id, name, company_id)')
          .eq('milestone_id', milestoneId)
        const affected = (allContacts ?? []).filter(c => removedIds.includes(c.user?.company_id))
        if (affected.length) {
          const names = affected.map(c => c.user?.name ?? 'Unknown').join(', ')
          if (!confirm(`Removing this company will also remove the following contacts from this milestone:\n\n${names}\n\nContinue?`)) {
            saveBtn.disabled = false; saveBtn.textContent = 'Save'
            return
          }
          await db.from('milestone_contacts').delete()
            .eq('milestone_id', milestoneId)
            .in('user_id', affected.map(c => c.user_id))
        }
      }

      const { error: delErr } = await db.from('milestone_visible_companies').delete().eq('milestone_id', milestoneId)
      if (delErr) { dlg.querySelector('#vis-error').textContent = delErr.message; dlg.querySelector('#vis-error').classList.remove('hidden'); saveBtn.disabled = false; saveBtn.textContent = 'Save'; return }

      if (selected.length) {
        const { error: insErr } = await db.from('milestone_visible_companies').insert(selected.map(cid => ({ milestone_id: milestoneId, company_id: cid })))
        if (insErr) { dlg.querySelector('#vis-error').textContent = insErr.message; dlg.querySelector('#vis-error').classList.remove('hidden'); saveBtn.disabled = false; saveBtn.textContent = 'Save'; return }
      }

      closeModal('visibility-modal')
      renderPage(await load())
    }
  }

  async function openEditDate(currentDate) {
    const isChange = !!currentDate
    const dlg = showModal({ id: 'date-modal', title: isChange ? 'Change Target Date' : 'Set Target Date', body: `
      <div class="space-y-4">
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Target date</label>
          <input type="date" id="target-date-input" value="${currentDate ?? ''}" class="${inputCls()}" />
        </div>
        ${isChange ? `<div class="space-y-1.5">
          <label class="text-sm font-medium text-gray-700">Reason for change <span class="text-red-500">*</span></label>
          <textarea id="date-reason-input" rows="3" placeholder="Why is the target date being moved?" class="${inputCls('resize-none')}"></textarea>
        </div>` : ''}
        <p id="date-error" class="hidden text-sm text-red-600"></p>
        <div class="flex justify-end gap-2">
          ${btn('Cancel', { variant: 'outline', cls: 'cancel-date' })}
          ${btn('Save', { cls: 'save-date' })}
        </div>
      </div>` })

    dlg.querySelector('.cancel-date').onclick = () => closeModal('date-modal')
    dlg.querySelector('.save-date').onclick = async () => {
      const newDate = dlg.querySelector('#target-date-input').value
      const reason = dlg.querySelector('#date-reason-input')?.value?.trim() ?? ''
      const errEl = dlg.querySelector('#date-error')

      if (isChange && !reason) {
        errEl.textContent = 'Please enter a reason for the date change.'
        errEl.classList.remove('hidden')
        return
      }

      const saveBtn = dlg.querySelector('.save-date'); saveBtn.disabled = true; saveBtn.textContent = 'Saving…'
      const { error } = await db.from('milestones').update({ target_date: newDate || null }).eq('id', milestoneId)
      if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); saveBtn.disabled = false; saveBtn.textContent = 'Save'; return }

      // Write to change log
      const { error: logErr } = await db.from('milestone_date_change_log').insert({
        milestone_id: milestoneId,
        old_date: isChange ? currentDate : null,
        new_date: newDate || null,
        reason: reason || 'Initial date set',
        changed_by: auth.profile?.id ?? null,
      })
      if (logErr) console.warn('Date log insert failed:', logErr.message)

      closeModal('date-modal')
      renderPage(await load())
    }
  }

  async function openDateHistory() {
    const { data: log } = await db.from('milestone_date_change_log')
      .select('*, changed_by_user:users(name)')
      .eq('milestone_id', milestoneId)
      .order('changed_at', { ascending: false })

    const rows = (log ?? []).map(entry => {
      const from = entry.old_date ?? '—'
      const to = entry.new_date ?? '—'
      const who = entry.changed_by_user?.name ?? 'Unknown'
      const when = new Date(entry.changed_at).toLocaleDateString()
      return `<div class="py-3 border-b last:border-0">
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs font-medium text-gray-700">${from} → ${to}</span>
          <span class="text-xs text-gray-400">${when} · ${who}</span>
        </div>
        <p class="text-sm text-gray-600">${entry.reason}</p>
      </div>`
    }).join('')

    showModal({ id: 'date-history-modal', title: 'Target Date History', body: `
      <div class="space-y-0 max-h-96 overflow-y-auto">
        ${rows || '<p class="text-sm text-gray-400 py-2">No changes recorded yet.</p>'}
      </div>
      <div class="flex justify-end pt-3">
        ${btn('Close', { variant: 'outline', cls: 'close-date-history' })}
      </div>` })

    document.querySelector('.close-date-history')?.addEventListener('click', () => closeModal('date-history-modal'))
  }

  async function openRefPhotoModal(label, itemId) {
    const { data: photos } = await db.from('milestone_template_item_photos')
      .select('*').eq('item_id', itemId).order('uploaded_at')

    const signedPhotos = await Promise.all((photos ?? []).map(async p => {
      const { data } = await db.storage.from('Documents').createSignedUrl(p.file_path, 3600)
      return { ...p, signedUrl: data?.signedUrl }
    }))

    const thumbsHtml = signedPhotos.map(p => `
      <div>
        <a href="${p.signedUrl}" target="_blank" class="block">
          <img src="${p.signedUrl}" alt="${p.filename}"
            class="w-full h-28 object-cover rounded-lg border border-gray-200 hover:border-amber-300 transition-colors" />
        </a>
        <p class="text-xs text-gray-400 truncate mt-1">${p.filename}</p>
      </div>`).join('')

    const dlg = showModal({ id: 'ref-photo-modal', title: `Reference photos — ${label}`, size: 'lg', body: `
      <div>
        <p class="text-xs text-amber-600 mb-3">These are reference photos set by the system manager to guide this check.</p>
        <div class="grid grid-cols-3 gap-3 mb-4">${thumbsHtml}</div>
        <div class="flex justify-end">
          ${btn('Close', { variant: 'outline', cls: 'close-ref-photo' })}
        </div>
      </div>` })

    dlg.querySelector('.close-ref-photo')?.addEventListener('click', () => closeModal('ref-photo-modal'))
  }

  async function openPhotoModal(label, respId, canUploadPhotos) {
    const { data: photos } = await db.from('checksheet_response_photos')
      .select('*').eq('response_id', respId).order('uploaded_at')

    // Generate signed URLs
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
        ${canUploadPhotos ? `<button class="del-photo-btn absolute top-1 right-1 bg-white/90 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity"
          data-photo-id="${p.id}" data-path="${p.file_path}">${icons.trash}</button>` : ''}
        <p class="text-xs text-gray-400 truncate mt-1">${p.filename}</p>
      </div>`).join('')

    const dlg = showModal({ id: 'photo-modal', title: `Photos — ${label}`, size: 'lg', body: `
      <div>
        ${signedPhotos.length > 0
          ? `<div class="grid grid-cols-3 gap-3 mb-4">${thumbsHtml}</div>`
          : `<p class="text-sm text-gray-400 text-center py-6 mb-2">No photos yet.</p>`}
        ${canUploadPhotos ? `
          <label class="flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-gray-200 px-4 py-5 cursor-pointer hover:border-blue-300 hover:bg-blue-50/40 transition-colors">
            <input type="file" class="hidden photo-upload-input" multiple accept="image/*" />
            <span class="text-gray-300">${icons.upload}</span>
            <span class="text-xs text-gray-400">Add photos — <span class="text-blue-600">click to browse</span></span>
          </label>
          <p id="photo-upload-error" class="hidden text-sm text-red-600 mt-2"></p>` : ''}
        <div class="flex justify-end pt-3">
          ${btn('Close', { variant: 'outline', cls: 'close-photo-modal' })}
        </div>
      </div>` })

    dlg.querySelector('.close-photo-modal')?.addEventListener('click', () => closeModal('photo-modal'))

    dlg.querySelector('.photo-upload-input')?.addEventListener('change', async function() {
      const files = [...(this.files ?? [])]; if (!files.length) return
      const errEl = dlg.querySelector('#photo-upload-error')
      errEl?.classList.add('hidden')
      this.disabled = true
      for (const file of files) {
        const safeName = sanitizeFilename(file.name)
        const filePath = `checksheet-photos/${milestoneId}/${respId}/${Date.now()}_${safeName}`
        const { error: uploadErr } = await db.storage.from('Documents').upload(filePath, file)
        if (uploadErr) {
          if (errEl) { errEl.textContent = uploadErr.message; errEl.classList.remove('hidden') }
          this.disabled = false; return
        }
        const { error: insErr } = await db.from('checksheet_response_photos').insert({
          response_id: respId, file_path: filePath, filename: file.name,
          uploaded_by: auth.profile?.id ?? null,
        })
        if (insErr) {
          if (errEl) { errEl.textContent = insErr.message; errEl.classList.remove('hidden') }
          this.disabled = false; return
        }
      }
      closeModal('photo-modal')
      renderPage(await load())
    })

    dlg.querySelectorAll('.del-photo-btn').forEach(b => {
      b.addEventListener('click', async () => {
        if (!confirm('Delete this photo?')) return
        b.disabled = true
        await db.storage.from('Documents').remove([b.dataset.path])
        await db.from('checksheet_response_photos').delete().eq('id', b.dataset.photoId)
        closeModal('photo-modal')
        renderPage(await load())
      })
    })
  }

  renderPage(await load())
}
