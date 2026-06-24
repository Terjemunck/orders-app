window.render_orderDetail = async function(container, orderId) {
  container.innerHTML = '<div class="p-6 text-sm text-gray-400">Loading…</div>'
  const canManage = auth.companyType === 'system_mgr' && auth.isManager
  const isProject = window.location.hash.startsWith('#/projects')
  const T        = isProject ? 'Project' : 'Order'
  const basePath = isProject ? '#/projects' : '#/orders'

  if (!document.getElementById('od-styles')) {
    const s = document.createElement('style')
    s.id = 'od-styles'
    s.textContent = `
      @keyframes od-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.55;transform:scale(1.25)}}
      .od-pulse{animation:od-pulse 2s ease-in-out infinite}
      @media(max-width:639px){
        .od-route{display:none!important}
        .od-date-col{display:none!important}
        .od-ms-row{padding-left:0.75rem!important;border-left:3px solid #E5E7EB}
        .od-ms-row.od-done{border-left-color:#1D9E75}
        .od-ms-row.od-active{border-left-color:#378ADD;background:#EFF6FF}
        .od-dot-col{display:none!important}
      }
    `
    document.head.appendChild(s)
  }

  let lastRenderData = null

  async function load() {
    const [{ data: ord }, { data: mss }] = await Promise.all([
      db.from('orders')
        .select('*, product:products(id, name), customer:companies!orders_customer_company_id_fkey(name), order_lines(quantity, variant:product_variants(name))')
        .eq('id', orderId).single(),
      db.from('milestones')
        .select('*, factory:companies!milestones_factory_company_id_fkey(name), documents(id, filename, file_path, uploaded_at)')
        .eq('order_id', orderId)
        .order('sort_order'),
    ])
    let templates = []
    if (ord?.product_id) {
      const { data: tpls } = await db.from('milestone_templates')
        .select('id, name, sort_order, require_prev_completed, enforce_date_order')
        .eq('product_id', ord.product_id)
        .order('sort_order')
      templates = tpls ?? []
    }
    return { order: ord, milestones: mss ?? [], templates }
  }

  function renderPage(data) {
    lastRenderData = data
    const { order, milestones, templates } = data
    if (!order) { container.innerHTML = `<div class="p-6 text-sm text-gray-500">${T} not found.</div>`; return }

    const viewMode = canManage ? (localStorage.getItem('od_view') ?? 'fancy') : 'fancy'

    const visibleMilestones = auth.companyType === 'factory'
      ? milestones.filter(m => m.factory_company_id === auth.profile?.company_id)
      : milestones

    const totalUnits = (order.order_lines ?? []).reduce((s, l) => s + (l.quantity ?? 0), 0)
    const linesHtml = (order.order_lines ?? []).map(l =>
      `<span class="text-gray-600">${l.variant?.name ?? 'Variant'}: <span class="font-medium">${(l.quantity ?? 0).toLocaleString()}</span></span>`
    ).join(' · ')

    const doneCount = visibleMilestones.filter(m => m.completed).length
    const total = visibleMilestones.length
    const pct = total ? Math.round((doneCount / total) * 100) : 0

    // Group by category (used by both views)
    const catGroups = []
    const seenCats = []
    for (const m of visibleMilestones) {
      const cat = m.category ?? ''
      if (!seenCats.includes(cat)) { seenCats.push(cat); catGroups.push({ cat, items: [] }) }
      catGroups.find(g => g.cat === cat).items.push(m)
    }

    const seqLock = `<svg class="h-3 w-3 text-gray-400 shrink-0 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24" title="Sequence rules active"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>`

    // ── Classic view ──────────────────────────────────────────────────────────
    function msStatus(m) {
      if (m.completed)  return badge('Completed', 'success')
      if (m.start_date) return badge('In Progress', 'info')
      return badge('Pending', 'outline')
    }

    function msRow(m, idx, totalCount) {
      const docCount = m.documents?.length ?? 0
      const dates = [
        m.start_date  ? `Started: ${m.start_date}` : null,
        m.target_date ? `Target: ${m.target_date}` : null,
        m.actual_date ? `Done: ${m.actual_date}` : null,
      ].filter(Boolean)
      const upBtn   = canManage && idx > 0
        ? `<button class="reorder-btn p-0.5 text-gray-300 hover:text-gray-600 rounded text-xs leading-none" data-idx="${idx}" data-dir="-1" title="Move up">▲</button>`
        : canManage ? `<span class="inline-block w-4"></span>` : ''
      const downBtn = canManage && idx < totalCount - 1
        ? `<button class="reorder-btn p-0.5 text-gray-300 hover:text-gray-600 rounded text-xs leading-none" data-idx="${idx}" data-dir="1" title="Move down">▼</button>`
        : canManage ? `<span class="inline-block w-4"></span>` : ''
      return `<div class="flex items-center gap-1.5">
        ${canManage ? `<div class="flex flex-col items-center shrink-0">${upBtn}${downBtn}</div>` : ''}
        <div class="flex flex-1 items-center justify-between rounded border bg-white px-3 py-2.5 cursor-pointer hover:bg-gray-50 milestone-link" data-ms="${m.id}">
          <div class="flex items-center gap-2 text-sm flex-wrap">
            ${msStatus(m)}
            <span class="${m.completed ? 'text-gray-500' : ''}">${m.name}</span>
            ${(m.require_prev_completed || m.enforce_date_order) ? seqLock : ''}
          </div>
          <div class="flex items-center gap-3 shrink-0">
            ${dates.map(d => `<span class="text-xs text-gray-400">${d}</span>`).join('')}
            ${docCount ? `<span class="text-xs text-gray-400">${docCount} doc${docCount !== 1 ? 's' : ''}</span>` : ''}
            ${canManage ? `<button class="p-1 text-gray-300 hover:text-gray-600 rounded edit-ms-btn" data-ms="${m.id}" title="Edit">${icons.pencil.replace('h-4 w-4','h-3.5 w-3.5')}</button>` : ''}
            <span class="text-gray-300">${icons.chevronRight}</span>
          </div>
        </div>
      </div>`
    }

    const classicBody = total
      ? `<div class="p-5"><div class="space-y-3">${
          catGroups.map(({ cat, items }) => `<div class="space-y-1.5">
            ${cat ? `<p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-2 first:mt-0">${cat}</p>` : ''}
            ${items.map(m => msRow(m, visibleMilestones.indexOf(m), visibleMilestones.length)).join('')}
          </div>`).join('')
        }</div></div>`
      : '<div class="p-5"><p class="text-sm text-gray-400">No milestones yet.</p></div>'

    // ── Fancy view ────────────────────────────────────────────────────────────
    const activeMilestone = visibleMilestones.find(m => m.start_date && !m.completed)
    const nextPending = !activeMilestone ? visibleMilestones.find(m => !m.completed) : null
    const focus = activeMilestone ?? nextPending

    const segBar = visibleMilestones.map(m =>
      `<div style="flex:1;height:7px;border-radius:4px;background:${m.completed ? '#1D9E75' : m.start_date ? '#378ADD' : '#E5E7EB'};"></div>`
    ).join('')

    const namedCats = catGroups.filter(g => g.cat)
    const routeHtml = namedCats.length > 1
      ? `<div class="od-route flex items-center gap-0 mt-4">${namedCats.map((g, i) => {
          const allDone = g.items.every(m => m.completed)
          const anyActive = g.items.some(m => m.start_date && !m.completed)
          const st = allDone ? 'done' : anyActive ? 'active' : 'pending'
          const dotInner = st === 'done'
            ? `<svg style="width:11px;height:11px;" fill="none" stroke="white" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3.5" d="M5 13l4 4L19 7"/></svg>`
            : st === 'active'
            ? `<span class="od-pulse" style="width:8px;height:8px;border-radius:50%;background:white;display:block;"></span>`
            : `<span style="width:6px;height:6px;border-radius:50%;background:#D1D5DB;display:block;"></span>`
          const dotStyle = `width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;${st==='done'?'background:#1D9E75;':st==='active'?'background:#378ADD;':'border:1.5px solid #D1D5DB;background:white;'}`
          const line = i < namedCats.length - 1
            ? `<div style="flex:1;height:1.5px;background:${allDone?'#1D9E75':'#E5E7EB'};margin-bottom:18px;"></div>`
            : ''
          return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
            <div style="${dotStyle}">${dotInner}</div>
            <p style="font-size:11px;font-weight:500;margin:0;text-align:center;color:${st==='pending'?'#9CA3AF':st==='active'?'#2563EB':'#374151'};">${g.cat}</p>
          </div>${line}`
        }).join('')}</div>`
      : ''

    const bannerHtml = focus
      ? `<div class="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 mt-4 flex items-center gap-3">
          <svg class="h-4 w-4 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${activeMilestone ? 'M13 10V3L4 14h7v7l9-11h-7z' : 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'}"/>
          </svg>
          <div>
            <p class="text-sm font-medium text-blue-800 m-0">${activeMilestone ? `Currently: ${focus.name}` : `Next up: ${focus.name}`}</p>
            ${focus.target_date ? `<p class="text-xs text-blue-600 m-0">Target: ${focus.target_date}</p>` : ''}
          </div>
        </div>`
      : ''

    let timelineHtml = ''
    let lastCat = null
    visibleMilestones.forEach((m, i) => {
      const isLast = i === visibleMilestones.length - 1
      const cat = m.category ?? ''
      const status = m.completed ? 'done' : m.start_date ? 'active' : 'pending'
      if (cat !== lastCat) {
        timelineHtml += `<div class="flex items-center gap-2 px-4 sm:px-5 ${i > 0 ? 'mt-2' : ''} mb-0.5">
          ${cat ? `<p class="text-xs font-semibold text-gray-400 uppercase tracking-wider m-0 whitespace-nowrap">${cat}</p>` : ''}
          <div class="flex-1 h-px bg-gray-100"></div>
        </div>`
        lastCat = cat
      }
      const dotHtml = status === 'done'
        ? `<div style="width:22px;height:22px;border-radius:50%;background:#1D9E75;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg style="width:11px;height:11px;" fill="none" stroke="white" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3.5" d="M5 13l4 4L19 7"/></svg></div>`
        : status === 'active'
        ? `<div class="od-pulse" style="width:22px;height:22px;border-radius:50%;background:#378ADD;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span style="width:7px;height:7px;border-radius:50%;background:white;display:block;"></span></div>`
        : `<div style="width:22px;height:22px;border-radius:50%;border:1.5px solid #D1D5DB;background:white;flex-shrink:0;"></div>`
      const subText = status === 'done'
        ? `<p class="text-xs text-green-600 m-0">Completed${m.actual_date ? ' ' + m.actual_date : ''}</p>`
        : status === 'active'
        ? `<p class="text-xs text-blue-600 font-medium m-0">In progress</p>`
        : `<p class="text-xs text-gray-400 m-0">${m.target_date ? 'Target: ' + m.target_date : 'Not started'}</p>`
      const docChips = (m.documents ?? []).map(d =>
        `<button class="open-doc-od flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800" data-path="${d.file_path}" title="${d.filename}">
          <svg class="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
          <span class="hover:underline truncate max-w-[150px]">${d.filename}</span>
        </button>`
      ).join('')
      const docsRow = docChips ? `<div class="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">${docChips}</div>` : ''
      const notesRow = m.notes ? `<p class="text-xs text-gray-400 m-0 mt-1 italic">${m.notes}</p>` : ''

      timelineHtml += `<div class="od-ms-row od-${status} milestone-link flex items-start px-4 sm:px-5 cursor-pointer ${status === 'active' ? 'bg-blue-50' : 'hover:bg-gray-50'}" data-ms="${m.id}">
        <div class="od-dot-col" style="display:flex;flex-direction:column;align-items:center;margin-right:12px;padding-top:5px;">
          ${dotHtml}
          ${isLast ? '' : `<div style="width:1px;background:#E5E7EB;flex:1;min-height:12px;margin-top:3px;"></div>`}
        </div>
        <div class="flex-1 flex items-start justify-between gap-3 py-3">
          <div class="min-w-0">
            <p class="text-sm m-0 mb-0.5 flex items-center gap-1.5 flex-wrap ${status === 'active' ? 'font-medium text-blue-700' : status === 'done' ? 'text-gray-700' : 'text-gray-500'}">
              <span>${m.name}</span>
              ${(m.require_prev_completed || m.enforce_date_order) ? seqLock : ''}
            </p>
            ${subText}
            ${notesRow}
            ${docsRow}
          </div>
          <div class="flex items-center gap-2 shrink-0 pt-0.5">
            ${m.actual_date || m.target_date ? `<span class="od-date-col text-xs text-gray-400">${m.actual_date ?? m.target_date}</span>` : ''}
            ${canManage ? `<button class="p-1 text-gray-300 hover:text-gray-600 rounded edit-ms-btn" data-ms="${m.id}" title="Edit">${icons.pencil.replace('h-4 w-4','h-3.5 w-3.5')}</button>` : ''}
            <span class="text-gray-300">${icons.chevronRight}</span>
          </div>
        </div>
      </div>`
    })

    const fancyBody = total
      ? `<div class="py-2">${timelineHtml}</div>`
      : '<div class="p-5"><p class="text-sm text-gray-400">No milestones yet.</p></div>'

    // ── Shared UI ─────────────────────────────────────────────────────────────
    const addBtn = canManage
      ? `<button class="add-milestone-btn inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">${icons.plus} Add Milestone</button>`
      : ''

    const toggleBtn = canManage
      ? `<button class="view-toggle-btn inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100" title="${viewMode === 'fancy' ? 'Switch to classic list view' : 'Switch to journey view'}">
          ${viewMode === 'fancy'
            ? `<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg> Classic`
            : `<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg> Journey`}
        </button>`
      : ''

    container.innerHTML = `<div class="p-3 sm:p-6 max-w-3xl page-enter">
      <button class="back-btn mb-3 sm:mb-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">${icons.arrowLeft} Back to ${T.toLowerCase()}s</button>

      <div class="mb-4 sm:mb-5">
        <div class="flex items-baseline gap-2 flex-wrap">
          <h1 class="text-lg sm:text-xl font-semibold">${order.product?.name}</h1>
          ${order.order_number != null ? `<span class="text-sm font-mono text-gray-400">#${String(order.order_number).padStart(4, '0')}</span>` : ''}
        </div>
        <div class="text-sm text-gray-500 mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
          <span>${order.customer?.name}</span>
          <span class="text-gray-300">·</span>
          <span>${isProject ? 'Started' : 'Ordered'}: ${order.order_date}</span>
          ${order.expected_delivery ? `<span class="text-gray-300">·</span><span>Delivery: ${order.expected_delivery}</span>` : ''}
        </div>
        ${order.order_lines?.length ? `<div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">${linesHtml} <span class="text-gray-800 font-semibold">Total: ${totalUnits.toLocaleString()} units</span></div>` : ''}
        ${order.description ? `<p class="text-sm text-gray-500 mt-2 m-0 italic">${order.description}</p>` : ''}
      </div>

      ${viewMode === 'fancy' && total ? `<div class="rounded-lg border bg-white shadow-sm p-4 sm:p-5 mb-3 sm:mb-4">
        <div class="flex items-start gap-4">
          <div style="display:flex;gap:3px;flex:1;align-self:center;">${segBar}</div>
          <div class="text-right shrink-0">
            <p class="text-xl font-semibold text-gray-900 m-0 leading-none">${pct}%</p>
            <p class="text-xs text-gray-400 m-0 mt-0.5">${doneCount} of ${total} done</p>
          </div>
        </div>
        ${routeHtml}
        ${bannerHtml}
      </div>` : ''}

      <div class="rounded-lg border bg-white shadow-sm">
        <div class="px-4 py-3 sm:px-5 sm:py-4 border-b flex items-center justify-between gap-2">
          <div class="flex items-center gap-3">
            <span class="font-semibold">${viewMode === 'fancy' ? 'Journey' : 'Milestones'}</span>
            ${total ? `<span class="text-sm text-gray-400">${doneCount}/${total} done</span>` : ''}
          </div>
          <div class="flex items-center gap-2">
            ${toggleBtn}
            ${addBtn}
          </div>
        </div>
        ${viewMode === 'fancy' ? fancyBody : classicBody}
      </div>
    </div>`

    container.querySelector('.back-btn').onclick = () => navigate(basePath)
    container.querySelectorAll('.milestone-link').forEach(el => {
      el.onclick = (e) => {
        if (e.target.closest('.edit-ms-btn')) return
        navigate(`${basePath}/${orderId}/milestones/${el.dataset.ms}`)
      }
    })

    container.querySelectorAll('.reorder-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation()
        const idx = parseInt(btn.dataset.idx)
        const dir = parseInt(btn.dataset.dir)
        const a = visibleMilestones[idx]
        const b = visibleMilestones[idx + dir]
        if (!a || !b) return
        btn.disabled = true
        const [sortA, sortB] = [a.sort_order, b.sort_order]
        await Promise.all([
          db.from('milestones').update({ sort_order: sortB }).eq('id', a.id),
          db.from('milestones').update({ sort_order: sortA }).eq('id', b.id),
        ])
        renderPage(await load())
      })
    })
    container.querySelectorAll('.edit-ms-btn').forEach(b => {
      b.addEventListener('click', e => {
        e.stopPropagation()
        const ms = milestones.find(m => m.id === b.dataset.ms)
        if (ms) openMilestoneForm(ms, templates)
      })
    })
    container.querySelector('.add-milestone-btn')?.addEventListener('click', () => openMilestoneForm(null, templates))
    container.querySelectorAll('.open-doc-od').forEach(b => {
      b.addEventListener('click', async (e) => {
        e.stopPropagation()
        const { data } = await db.storage.from('Documents').createSignedUrl(b.dataset.path, 3600)
        if (data?.signedUrl) window.open(data.signedUrl, '_blank')
      })
    })
    container.querySelector('.view-toggle-btn')?.addEventListener('click', () => {
      localStorage.setItem('od_view', viewMode === 'fancy' ? 'classic' : 'fancy')
      renderPage(lastRenderData)
    })
  }

  async function openMilestoneForm(milestone, templates = []) {
    const isEdit = !!milestone

    let nextSort = 1
    if (!isEdit) {
      const { data: existingMs } = await db.from('milestones').select('sort_order').eq('order_id', orderId).order('sort_order', { ascending: false }).limit(1)
      nextSort = existingMs?.[0]?.sort_order != null ? existingMs[0].sort_order + 1 : 1
    }

    const matchTpl = !isEdit ? (templates.find(t => t.sort_order === nextSort) ?? templates[nextSort - 1]) : null
    const defPrev = milestone?.require_prev_completed ?? matchTpl?.require_prev_completed ?? false
    const defDate = milestone?.enforce_date_order ?? matchTpl?.enforce_date_order ?? false

    let visibleCompanyIds = new Set()
    let contactsByRole = { milestone_owner: new Set(), checksheet_owner: new Set() }
    let allDocTypes = []
    let checkedLibraryIds = new Set()
    let customDocs = []

    const fetches = [
      db.from('companies').select('id, name').eq('type', 'factory').order('name'),
      db.from('companies').select('id, name, type').in('type', ['customer', 'factory']).order('name'),
      db.from('users').select('id, name, email').order('name'),
      db.from('document_types').select('id, name').order('name'),
    ]
    if (isEdit) {
      fetches.push(
        db.from('milestone_visible_companies').select('company_id').eq('milestone_id', milestone.id),
        db.from('milestone_contacts').select('user_id, role').eq('milestone_id', milestone.id),
        db.from('milestone_required_docs').select('id, document_type_id, custom_name, document_id').eq('milestone_id', milestone.id),
      )
    }

    const results = await Promise.all(fetches)
    const factories = results[0]?.data ?? []
    const allCos   = results[1]?.data ?? []
    const allUsers = results[2]?.data ?? []
    allDocTypes    = results[3]?.data ?? []

    if (isEdit) {
      visibleCompanyIds = new Set((results[4]?.data ?? []).map(r => r.company_id))
      for (const c of results[5]?.data ?? []) contactsByRole[c.role]?.add(c.user_id)
      for (const rd of results[6]?.data ?? []) {
        if (rd.document_id) continue  // fulfilled slot — skip, preserved on save
        if (rd.document_type_id) checkedLibraryIds.add(rd.document_type_id)
        else if (rd.custom_name) customDocs.push({ custom_name: rd.custom_name })
      }
    }

    const factoryOpts = factories.map(c => `<option value="${c.id}" ${milestone?.factory_company_id === c.id ? 'selected' : ''}>${c.name}</option>`).join('')

    const sectionHead = label => `<p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">${label}</p>`

    function visibilityHtml() {
      if (!allCos.length) return '<p class="text-xs text-gray-400">No companies found.</p>'
      return allCos.map(c => `<label class="flex items-center gap-2 cursor-pointer py-0.5">
        <input type="checkbox" class="vis-check rounded" value="${c.id}" ${visibleCompanyIds.has(c.id) ? 'checked' : ''} />
        <span class="text-xs">${c.name} <span class="text-gray-400">${c.type === 'factory' ? '· factory' : '· customer'}</span></span>
      </label>`).join('')
    }

    function contactsRoleHtml(role) {
      if (!allUsers.length) return '<p class="text-xs text-gray-400 italic">No users.</p>'
      return allUsers.map(u => `<label class="flex items-center gap-2 cursor-pointer py-0.5">
        <input type="checkbox" class="contact-check rounded" data-role="${role}" value="${u.id}" ${contactsByRole[role]?.has(u.id) ? 'checked' : ''} />
        <span class="text-xs">${u.name ?? u.email}</span>
      </label>`).join('')
    }

    function requiredDocsLibraryHtml() {
      if (!allDocTypes.length) return '<p class="text-xs text-gray-400 italic">No types — add in Settings.</p>'
      return allDocTypes.map(dt => `<label class="flex items-center gap-2 cursor-pointer py-0.5">
        <input type="checkbox" class="req-doc-check rounded" value="${dt.id}" ${checkedLibraryIds.has(dt.id) ? 'checked' : ''} />
        <span class="text-xs">${dt.name}</span>
      </label>`).join('')
    }

    function customDocsHtml() {
      return customDocs.map((d, i) => `<div class="flex items-center gap-1.5 custom-doc-row" data-idx="${i}">
        <span class="text-xs text-gray-700 flex-1">${d.custom_name}</span>
        <button type="button" class="remove-custom-doc shrink-0 p-0.5 text-gray-300 hover:text-red-500" data-idx="${i}">${icons.x.replace('h-4 w-4','h-3 w-3')}</button>
      </div>`).join('')
    }

    function renderCustomDocs(d) {
      const el = d.querySelector('#ms-custom-docs-list')
      if (el) el.innerHTML = customDocsHtml()
      d.querySelectorAll('.remove-custom-doc').forEach(b => {
        b.onclick = () => { customDocs.splice(parseInt(b.dataset.idx), 1); renderCustomDocs(d) }
      })
    }

    const dlg = showModal({ id: 'ms-modal', title: isEdit ? 'Edit Milestone' : 'Add Milestone', size: '2xl', body: `
      <form id="ms-form">
        <div class="grid grid-cols-3 gap-4">

          <!-- COL 1 -->
          <div class="space-y-3">
            <div class="space-y-1">
              <label class="text-xs font-medium text-gray-600">Name</label>
              <input name="name" required value="${milestone?.name ?? ''}" placeholder="e.g. Production complete" class="${inputCls()}" />
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div class="space-y-1">
                <label class="text-xs font-medium text-gray-600">Category</label>
                <input name="category" value="${milestone?.category ?? ''}" placeholder="e.g. Production" class="${inputCls()}" />
              </div>
              <div class="space-y-1">
                <label class="text-xs font-medium text-gray-600">Sort</label>
                <input type="number" name="sort_order" value="${milestone?.sort_order ?? nextSort}" min="0" class="${inputCls()}" />
              </div>
            </div>
            <div class="space-y-1">
              <label class="text-xs font-medium text-gray-600">Factory</label>
              <select name="factory_company_id" class="${inputCls()}"><option value="">None</option>${factoryOpts}</select>
            </div>
            <div class="space-y-1">
              <label class="text-xs font-medium text-gray-600">Target Date</label>
              <input type="date" name="target_date" value="${milestone?.target_date ?? ''}" class="${inputCls()}" />
            </div>
          </div>

          <!-- COL 2 -->
          <div class="space-y-4 border-l pl-4">
            <div>
              ${sectionHead('Sequence Rules')}
              <div class="space-y-1.5">
                <label class="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" name="require_prev_completed" class="mt-0.5 rounded shrink-0" ${defPrev ? 'checked' : ''} />
                  <span class="text-xs text-gray-700">Require prev. completed</span>
                </label>
                <label class="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" name="enforce_date_order" class="mt-0.5 rounded shrink-0" ${defDate ? 'checked' : ''} />
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

          <!-- COL 3 -->
          <div class="space-y-4 border-l pl-4">
            <div class="flex gap-2 justify-end">
              <p id="ms-error" class="hidden text-xs text-red-600 self-center mr-auto"></p>
              ${btn('Cancel', { variant: 'outline', size: 'sm', cls: 'cancel-ms' })}
              ${btn(isEdit ? 'Save' : 'Add', { type: 'submit', size: 'sm', cls: 'submit-ms' })}
            </div>
            <div>
              ${sectionHead('Visible to')}
              <div class="max-h-36 overflow-y-auto space-y-0.5">${visibilityHtml()}</div>
            </div>
            <div>
              ${sectionHead('Required Docs')}
              <div id="ms-req-docs-library" class="max-h-28 overflow-y-auto space-y-0.5 mb-1">${requiredDocsLibraryHtml()}</div>
              <div id="ms-custom-docs-list" class="space-y-0.5 mb-1.5"></div>
              <div class="flex gap-1">
                <input type="text" id="ms-new-custom-doc" placeholder="Custom doc…" class="flex-1 min-w-0 rounded border border-gray-300 px-2 py-1 text-xs" />
                <button type="button" id="ms-add-custom-doc-lib" title="Add &amp; save to library" class="shrink-0 px-1.5 py-1 text-xs rounded border border-gray-300 bg-white hover:bg-gray-50">📚</button>
                <button type="button" id="ms-add-custom-doc-only" title="This milestone only" class="shrink-0 px-1.5 py-1 text-xs rounded border border-gray-300 bg-white hover:bg-gray-50">+</button>
              </div>
              <p id="ms-req-doc-error" class="hidden text-xs text-red-600 mt-1"></p>
              ${isEdit ? '<p class="text-xs text-gray-400 mt-1">Fulfilled doc slots are preserved.</p>' : ''}
            </div>
          </div>

        </div>
      </form>` })

    dlg.querySelector('.cancel-ms').onclick = () => closeModal('ms-modal')
    renderCustomDocs(dlg)

    dlg.querySelector('#ms-add-custom-doc-lib').onclick = async () => {
      const input = dlg.querySelector('#ms-new-custom-doc')
      const errEl = dlg.querySelector('#ms-req-doc-error')
      const name = input.value.trim(); errEl.classList.add('hidden')
      if (!name) return
      const libBtn = dlg.querySelector('#ms-add-custom-doc-lib')
      libBtn.disabled = true; libBtn.textContent = '…'
      const { data, error } = await db.from('document_types').insert({ name }).select('id, name').single()
      if (error) {
        errEl.textContent = error.message.includes('unique') ? `"${name}" already in library.` : error.message
        errEl.classList.remove('hidden'); libBtn.disabled = false; libBtn.textContent = '📚'; return
      }
      allDocTypes.push(data); allDocTypes.sort((a, b) => a.name.localeCompare(b.name))
      checkedLibraryIds.add(data.id)
      dlg.querySelector('#ms-req-docs-library').innerHTML = requiredDocsLibraryHtml()
      input.value = ''; libBtn.disabled = false; libBtn.textContent = '📚'
    }

    dlg.querySelector('#ms-add-custom-doc-only').onclick = () => {
      const input = dlg.querySelector('#ms-new-custom-doc')
      const name = input.value.trim(); if (!name) return
      customDocs.push({ custom_name: name }); renderCustomDocs(dlg); input.value = ''
    }

    dlg.querySelector('#ms-form').onsubmit = async (e) => {
      e.preventDefault()
      const fd = new FormData(e.target)
      const submitBtn = dlg.querySelector('.submit-ms')
      const errEl = dlg.querySelector('#ms-error')
      submitBtn.disabled = true; submitBtn.textContent = 'Saving…'; errEl.classList.add('hidden')

      const payload = {
        order_id: orderId,
        template_id: isEdit ? milestone.template_id : (matchTpl?.id ?? null),
        name: fd.get('name'),
        category: fd.get('category') || null,
        factory_company_id: fd.get('factory_company_id') || null,
        target_date: fd.get('target_date') || null,
        sort_order: parseInt(fd.get('sort_order')) || 0,
        require_prev_completed: fd.get('require_prev_completed') === 'on',
        enforce_date_order: fd.get('enforce_date_order') === 'on',
      }

      let msId = milestone?.id
      if (isEdit) {
        const { error } = await db.from('milestones').update(payload).eq('id', msId)
        if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); submitBtn.disabled = false; submitBtn.textContent = 'Save'; return }
      } else {
        const { data, error } = await db.from('milestones').insert(payload).select('id').single()
        if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); submitBtn.disabled = false; submitBtn.textContent = 'Add'; return }
        msId = data.id
      }

      // Sync visible companies
      const visChecked = Array.from(dlg.querySelectorAll('.vis-check:checked')).map(cb => cb.value)
      await db.from('milestone_visible_companies').delete().eq('milestone_id', msId)
      if (visChecked.length) await db.from('milestone_visible_companies').insert(visChecked.map(cid => ({ milestone_id: msId, company_id: cid })))

      // Sync contacts
      await db.from('milestone_contacts').delete().eq('milestone_id', msId)
      const contactRows = []
      dlg.querySelectorAll('.contact-check:checked').forEach(cb => contactRows.push({ milestone_id: msId, user_id: cb.value, role: cb.dataset.role }))
      if (contactRows.length) await db.from('milestone_contacts').insert(contactRows)

      // Sync required docs — delete unfulfilled only, re-insert from form
      await db.from('milestone_required_docs').delete().eq('milestone_id', msId).is('document_id', null)
      const libChecked = Array.from(dlg.querySelectorAll('.req-doc-check:checked')).map(cb => cb.value)
      const docRows = [
        ...libChecked.map(dtId => ({ milestone_id: msId, document_type_id: dtId })),
        ...customDocs.map(d => ({ milestone_id: msId, custom_name: d.custom_name })),
      ]
      if (docRows.length) await db.from('milestone_required_docs').insert(docRows)

      closeModal('ms-modal')
      renderPage(await load())
    }
  }

  renderPage(await load())
}
