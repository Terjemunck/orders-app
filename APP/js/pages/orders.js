window.render_orders = async function(container) {
  container.innerHTML = '<div class="p-6 text-sm text-gray-400">Loading…</div>'

  const isProject = window.location.hash.startsWith('#/projects')
  const type      = isProject ? 'project' : 'order'
  const T         = isProject ? 'Project' : 'Order'
  const basePath  = isProject ? '#/projects' : '#/orders'

  const canCreate = auth.isManager && (isProject ? auth.companyType === 'system_mgr' : (auth.companyType === 'system_mgr' || auth.companyType === 'customer'))
  const canEdit   = auth.companyType === 'system_mgr' && auth.isManager

  const titleMap = {
    system_mgr: isProject ? 'All Projects'      : 'All Orders',
    factory:    isProject ? 'My Stage Projects' : 'My Stage Orders',
    customer:   isProject ? 'My Projects'       : 'My Orders',
  }
  const title = titleMap[auth.companyType] ?? (isProject ? 'Projects' : 'Orders')

  let products = [], companies = [], variants = [], allUsers = []
  let editingOrder = null, deleteTarget = null

  async function load() {
    let data, error
    const useRpc = isProject || auth.companyType === 'system_mgr'
    if (useRpc) {
      ;({ data, error } = await db.rpc('get_involved_orders', { p_type: type }))
      if (!error && data) {
        // Enrich with related data via separate select (RPC returns base columns only)
        const ids = data.map(o => o.id)
        if (ids.length) {
          const { data: enriched } = await db.from('orders')
            .select('id, product:products(name), customer_company:companies(name), order_lines(id, quantity, variant:product_variants(name))')
            .in('id', ids)
          const enrichMap = Object.fromEntries((enriched ?? []).map(e => [e.id, e]))
          data = data.map(o => ({ ...o, ...enrichMap[o.id] }))
        }
      }
    } else {
      ;({ data, error } = await db.from('orders')
          .select('*, product:products(name), customer_company:companies(name), order_lines(id, quantity, variant:product_variants(name))')
          .eq('type', type)
          .order('order_date', { ascending: false }))
    }
    if (error) { container.innerHTML = `<div class="p-6 text-sm text-red-600">Failed to load: ${error.message}</div>`; return null }
    const orders = data ?? []

    // Fetch milestone completion stats for all orders in one query
    if (orders.length) {
      const ids = orders.map(o => o.id)
      const { data: mss } = await db.from('milestones')
        .select('order_id, completed')
        .in('order_id', ids)
      const statsMap = {}
      for (const m of mss ?? []) {
        if (!statsMap[m.order_id]) statsMap[m.order_id] = { total: 0, done: 0 }
        statsMap[m.order_id].total++
        if (m.completed) statsMap[m.order_id].done++
      }
      for (const o of orders) {
        const s = statsMap[o.id] ?? { total: 0, done: 0 }
        o._pct = s.total ? Math.round((s.done / s.total) * 100) : null
      }
    }

    return orders
  }

  async function loadFormData() {
    let productQuery = db.from('products').select('id, name, product_variants(id, name)').order('name')
    if (auth.companyType === 'customer' && auth.profile?.company_id) {
      productQuery = productQuery
        .eq('internal', false)
        .or(`customer_company_id.is.null,customer_company_id.eq.${auth.profile.company_id}`)
    }
    const [{ data: p }, { data: c }, { data: u }] = await Promise.all([
      productQuery,
      db.from('companies').select('id, name').eq('type', 'customer').order('name'),
      db.from('users').select('id, name, email').order('name'),
    ])
    products = p ?? []
    companies = c ?? []
    allUsers = (u ?? []).filter(u => u.email)
  }

  function totalUnits(order) {
    return (order.order_lines ?? []).reduce((s, l) => s + (l.quantity ?? 0), 0)
  }

  function progressCell(pct) {
    if (pct === null) return '<td class="px-4 py-3 text-gray-300 text-xs">—</td>'
    const colour = pct === 100 ? 'bg-green-500' : 'bg-blue-400'
    const textColour = pct === 100 ? 'text-green-700' : 'text-blue-600'
    return `<td class="px-4 py-3 w-20">
      <div class="flex flex-col gap-1">
        <span class="text-xs font-medium ${textColour}">${pct}%</span>
        <div class="h-1 w-full rounded-full bg-gray-100">
          <div class="h-1 rounded-full ${colour}" style="width:${pct}%"></div>
        </div>
      </div>
    </td>`
  }

  function renderTable(orders) {
    const header = pageHeader(title, canCreate ? btn(`${icons.plus} New ${T}`, { size: 'sm', cls: 'new-order-btn' }) : '')
    if (!orders.length) {
      container.innerHTML = `<div class="p-6">${header}<p class="text-sm text-gray-400">No ${T.toLowerCase()}s found.</p></div>`
      container.querySelector('.new-order-btn')?.addEventListener('click', () => openForm(null))
      return
    }

    const active    = orders.filter(o => o._pct !== 100)
    const completed = orders.filter(o => o._pct === 100)

    function orderRow(o, faded = false) {
      const lines = (o.order_lines ?? []).map(l => `<div>${l.variant?.name ?? 'No variant'}: ${(l.quantity ?? 0).toLocaleString()}</div>`).join('')
      const actions = canEdit ? `<div class="flex items-center gap-1 justify-end stop-prop">
        <button class="p-1 text-gray-400 hover:text-gray-700 rounded edit-btn" data-id="${o.id}">${icons.pencil}</button>
        <button class="p-1 text-gray-400 hover:text-red-500 rounded del-btn" data-id="${o.id}">${icons.trash}</button>
      </div>` : ''
      const fadeCls = faded ? 'opacity-50' : ''
      return `<tr class="hover:bg-gray-50 cursor-pointer order-row ${fadeCls}" data-id="${o.id}">
        <td class="px-4 py-3 text-gray-400 text-xs font-mono">${String(o.order_number ?? '').padStart(4, '0')}</td>
        <td class="px-4 py-3 font-medium">${o.product?.name ?? '—'}</td>
        <td class="px-4 py-3 text-gray-600">${o.customer_company?.name ?? '—'}</td>
        <td class="px-4 py-3 text-gray-500 text-xs">${lines}</td>
        <td class="px-4 py-3 text-right font-medium">${totalUnits(o).toLocaleString()}</td>
        ${progressCell(o._pct)}
        <td class="px-4 py-3 text-gray-600">${o.order_date}</td>
        <td class="px-4 py-3 text-gray-600">${o.expected_delivery ?? '—'}</td>
        <td class="px-4 py-3">${actions}</td>
      </tr>`
    }

    function orderCard(o, faded = false) {
      const pct = o._pct
      const fadeCls = faded ? 'opacity-50' : ''
      const pctBadge = pct !== null
        ? `<span class="text-xs font-semibold ${pct === 100 ? 'text-green-600' : 'text-blue-600'}">${pct}%</span>`
        : ''
      const actions = canEdit ? `<div class="flex items-center gap-2 mt-2 stop-prop">
        <button class="text-xs text-gray-400 hover:text-gray-700 edit-btn flex items-center gap-1" data-id="${o.id}">${icons.pencil} Edit</button>
        <button class="text-xs text-gray-400 hover:text-red-500 del-btn flex items-center gap-1" data-id="${o.id}">${icons.trash} Delete</button>
      </div>` : ''
      return `<div class="order-row border-b last:border-0 px-4 py-3.5 cursor-pointer hover:bg-gray-50 active:bg-gray-100 ${fadeCls}" data-id="${o.id}">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 mb-0.5">
              <span class="text-xs font-mono text-gray-400">#${String(o.order_number ?? '').padStart(4, '0')}</span>
              <span class="font-medium text-sm truncate">${o.product?.name ?? '—'}</span>
            </div>
            <p class="text-xs text-gray-500 m-0">${o.customer_company?.name ?? '—'}</p>
            ${o.expected_delivery ? `<p class="text-xs text-gray-400 m-0 mt-0.5">Delivery: ${o.expected_delivery}</p>` : ''}
          </div>
          <div class="shrink-0 text-right">${pctBadge}</div>
        </div>
        ${pct !== null ? `<div class="mt-2 h-1.5 w-full rounded-full bg-gray-100"><div class="h-1.5 rounded-full ${pct === 100 ? 'bg-green-500' : 'bg-blue-400'}" style="width:${pct}%"></div></div>` : ''}
        ${actions}
      </div>`
    }

    const dateLabel = isProject ? 'Start Date' : 'Order Date'
    const cols = ['#','Product','Customer','Lines','Total Units','Progress', dateLabel,'Delivery','']

    let rows = active.map(o => orderRow(o, false)).join('')
    let cards = active.map(o => orderCard(o, false)).join('')

    if (completed.length) {
      rows += `<tr><td colspan="${cols.length}" class="px-4 pt-5 pb-1">
        <span class="text-xs font-medium text-gray-400 uppercase tracking-wide">Completed (${completed.length})</span>
      </td></tr>`
      rows += completed.map(o => orderRow(o, true)).join('')
      cards += `<div class="px-4 pt-4 pb-1"><span class="text-xs font-medium text-gray-400 uppercase tracking-wide">Completed (${completed.length})</span></div>`
      cards += completed.map(o => orderCard(o, true)).join('')
    }

    const table = tableWrap(cols, rows)
    container.innerHTML = `<div class="p-4 sm:p-6 page-enter">
      ${header}
      <div class="hidden sm:block">${table}</div>
      <div class="sm:hidden rounded-lg border bg-white shadow-sm overflow-hidden">${cards}</div>
    </div>`
    bindTable(orders)
  }

  function bindTable(orders) {
    container.querySelector('.new-order-btn')?.addEventListener('click', () => openForm(null))
    container.querySelectorAll('.order-row').forEach(row => {
      row.addEventListener('click', e => {
        if (!e.target.closest('.stop-prop')) navigate(`${basePath}/${row.dataset.id}`)
      })
    })
    container.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); openForm(orders.find(o => o.id === btn.dataset.id)) })
    })
    container.querySelectorAll('.del-btn').forEach(b => {
      b.addEventListener('click', e => { e.stopPropagation(); openDeleteConfirm(orders.find(o => o.id === b.dataset.id)) })
    })
  }

  async function openForm(order) {
    await loadFormData()
    editingOrder = order

    let currentVariants = []
    let lines = [{ variant_id: '', quantity: '' }]

    if (order) {
      const { data: vars } = await db.from('product_variants').select('id, name').eq('product_id', order.product_id)
      currentVariants = vars ?? []
      const { data: existingLines } = await db.from('order_lines').select('id, variant_id, quantity').eq('order_id', order.id)
      lines = existingLines?.length ? existingLines.map(l => ({ id: l.id, variant_id: l.variant_id ?? '', quantity: String(l.quantity) })) : [{ variant_id: '', quantity: '' }]
    }

    function variantSelect(line, idx) {
      if (!currentVariants.length) return ''
      return `<select name="variant_${idx}" class="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-blue-500">
        <option value="">Variant</option>
        ${currentVariants.map(v => `<option value="${v.id}" ${v.id === line.variant_id ? 'selected' : ''}>${v.name}</option>`).join('')}
      </select>`
    }

    function linesHtml() {
      return lines.map((l, i) => `<div class="flex items-center gap-2 line-row" data-idx="${i}">
        ${variantSelect(l, i)}
        <input type="number" name="qty_${i}" min="1" placeholder="Qty" value="${l.quantity}"
          class="${currentVariants.length ? 'w-24' : 'flex-1'} rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
        ${lines.length > 1 ? `<button type="button" class="remove-line p-1 text-gray-400 hover:text-red-500" data-idx="${i}">${icons.x}</button>` : ''}
      </div>`).join('')
    }

    const productOpts = products.map(p => `<option value="${p.id}" ${order?.product_id === p.id ? 'selected' : ''}>${p.name}</option>`).join('')
    const customerOpts = companies.map(c => `<option value="${c.id}" ${order?.customer_company_id === c.id ? 'selected' : ''}>${c.name}</option>`).join('')

    const customerField = isProject
      ? '' // auto-set to own company on submit
      : auth.companyType === 'customer'
        ? `<input value="${auth.profile?.company?.name ?? ''}" disabled class="${inputCls('bg-gray-50')}" />`
        : `<select name="customer_company_id" class="${inputCls()}"><option value="">Select customer</option>${customerOpts}</select>`

    const dateLabel = isProject ? 'Start Date' : 'Order Date'
    const notifyUsersHtml = !order && allUsers.length ? `
      <div class="space-y-1.5">
        <label class="text-sm font-medium text-gray-700">Notify on creation</label>
        <div class="rounded-md border border-gray-200 max-h-36 overflow-y-auto divide-y">
          ${allUsers.map(u => `
            <label class="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" name="notify_user" value="${u.id}" class="rounded border-gray-300" />
              <span class="text-sm flex-1">${u.name ?? u.email}</span>
              <span class="text-xs text-gray-400 truncate max-w-[140px]">${u.email}</span>
            </label>`).join('')}
        </div>
      </div>` : ''

    const bodyHtml = `<form id="order-form" class="space-y-4">
      <div class="space-y-1.5"><label class="text-sm font-medium text-gray-700">Product</label>
        <select name="product_id" id="product-select" class="${inputCls()}">
          <option value="">Select product</option>${productOpts}
        </select>
      </div>
      <div id="lines-section" class="${order?.product_id ? '' : 'hidden'} space-y-2">
        <label class="text-sm font-medium text-gray-700">Lines</label>
        <div id="lines-container">${linesHtml()}</div>
        <button type="button" id="add-line" class="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800">${icons.plus} Add line</button>
      </div>
      ${isProject ? '' : `<div class="space-y-1.5"><label class="text-sm font-medium text-gray-700">Customer</label>${customerField}</div>`}
      <div class="grid grid-cols-2 gap-3">
        ${formField(dateLabel, `<input type="date" name="order_date" value="${order?.order_date ?? new Date().toISOString().split('T')[0]}" required class="${inputCls()}" />`)}
        ${formField('Expected Delivery', `<input type="date" name="expected_delivery" value="${order?.expected_delivery ?? ''}" class="${inputCls()}" />`)}
      </div>
      ${formField('Description', `<textarea name="description" rows="3" placeholder="Optional description or notes about this ${type}…" class="${inputCls()} resize-none">${order?.description ?? ''}</textarea>`)}
      ${auth.companyType === 'system_mgr' ? `<label class="flex items-start gap-3 cursor-pointer select-none rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
        <input type="checkbox" name="suppress_notifications" class="mt-0.5 rounded border-gray-300 shrink-0" ${order?.suppress_notifications ? 'checked' : ''} />
        <span>
          <span class="text-sm font-medium text-orange-800">🔕 Suppress all email notifications</span>
          <span class="block text-xs text-orange-600 mt-0.5">No emails will be sent for this ${type} until unchecked. Use during initial data entry.</span>
        </span>
      </label>` : ''}
      ${notifyUsersHtml}
      <p id="form-error" class="hidden text-sm text-red-600"></p>
      <div class="flex justify-end gap-2 pt-2">
        ${btn('Cancel', { variant: 'outline', cls: 'cancel-btn' })}
        ${btn(order ? 'Save' : 'Create', { type: 'submit', cls: 'submit-btn' })}
      </div>
    </form>`

    const dlg = showModal({ id: 'order-modal', title: order ? `Edit ${T}` : `New ${T}`, body: bodyHtml })

    dlg.querySelector('.cancel-btn').onclick = () => closeModal('order-modal')

    // Product change
    dlg.querySelector('#product-select').onchange = function() {
      const prod = products.find(p => p.id === this.value)
      currentVariants = prod?.product_variants ?? []
      lines = [{ variant_id: '', quantity: '' }]
      dlg.querySelector('#lines-section').classList.toggle('hidden', !this.value)
      dlg.querySelector('#lines-container').innerHTML = linesHtml()
      bindLines()
    }

    function bindLines() {
      dlg.querySelectorAll('.remove-line').forEach(b => {
        b.onclick = () => { lines.splice(parseInt(b.dataset.idx), 1); dlg.querySelector('#lines-container').innerHTML = linesHtml(); bindLines() }
      })
      dlg.querySelector('#add-line').onclick = () => { lines.push({ variant_id: '', quantity: '' }); dlg.querySelector('#lines-container').innerHTML = linesHtml(); bindLines() }
      // Sync select/input values back to lines array on change
      dlg.querySelectorAll('.line-row').forEach((row, i) => {
        row.querySelector('select')?.addEventListener('change', function() { lines[i].variant_id = this.value })
        row.querySelector('input[type=number]')?.addEventListener('input', function() { lines[i].quantity = this.value })
      })
    }

    if (order?.product_id) bindLines()

    dlg.querySelector('#order-form').onsubmit = async (e) => {
      e.preventDefault()
      const errEl = dlg.querySelector('#form-error')
      const submitBtn = dlg.querySelector('.submit-btn')
      errEl.classList.add('hidden')

      try {
        const fd = new FormData(e.target)
        const productId = fd.get('product_id')
        const customerCompanyId = isProject
          ? auth.profile?.company_id
          : auth.companyType === 'customer' ? auth.profile?.company_id : fd.get('customer_company_id')
        const validLines = lines.filter(l => l.quantity && parseInt(l.quantity) > 0)

        if (!productId) { errEl.textContent = 'Please select a product.'; errEl.classList.remove('hidden'); return }
        if (!customerCompanyId) { errEl.textContent = 'Please select a customer.'; errEl.classList.remove('hidden'); return }
        if (!validLines.length) { errEl.textContent = 'Add at least one line with a quantity.'; errEl.classList.remove('hidden'); return }
        if (currentVariants.length && validLines.some(l => !l.variant_id)) { errEl.textContent = 'Each line needs a variant selected.'; errEl.classList.remove('hidden'); return }

        submitBtn.disabled = true; submitBtn.textContent = 'Saving…'

        const notifyUserIds = !editingOrder
          ? [...dlg.querySelectorAll('input[name="notify_user"]:checked')].map(el => el.value)
          : []

        const payload = {
          product_id: productId,
          customer_company_id: customerCompanyId,
          order_date: fd.get('order_date'),
          expected_delivery: fd.get('expected_delivery') || null,
          description: fd.get('description')?.trim() || null,
          suppress_notifications: auth.companyType === 'system_mgr' ? fd.get('suppress_notifications') === 'on' : undefined,
          created_by: editingOrder ? undefined : (auth.profile?.id ?? null),
          type: editingOrder ? undefined : type,
        }
        let orderId = editingOrder?.id

        if (editingOrder) {
          const { error: err } = await db.from('orders').update(payload).eq('id', orderId)
          if (err) throw new Error(err.message)
          await db.from('order_lines').delete().eq('order_id', orderId)
        } else {
          const { data: rows, error: err } = await db.from('orders').insert(payload).select('id')
          if (err) throw new Error(err.message)
          orderId = rows?.[0]?.id
          if (!orderId) throw new Error('Order inserted but no ID returned — check RLS policies.')
        }

        const { error: linesErr } = await db.from('order_lines').insert(validLines.map(l => ({ order_id: orderId, variant_id: l.variant_id || null, quantity: parseInt(l.quantity) })))
        if (linesErr) throw new Error(linesErr.message)

        // Fire notification email for new order/project
        if (!editingOrder && notifyUserIds.length) {
          const { data: { session } } = await db.auth.getSession()
          fetch(`${SUPABASE_URL}/functions/v1/notify-order-created`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify({ order_id: orderId, notify_user_ids: notifyUserIds }),
          }).catch(err => console.warn('notify-order-created failed:', err))
        }

        closeModal('order-modal')
        const orders = await load()
        if (orders !== null) renderTable(orders)

      } catch (ex) {
        errEl.textContent = ex.message
        errEl.classList.remove('hidden')
        submitBtn.disabled = false
        submitBtn.textContent = editingOrder ? 'Save' : 'Create'
      }
    }
  }

  function openDeleteConfirm(order) {
    deleteTarget = order
    const dlg = showModal({ id: 'del-modal', title: `Delete ${T}`, body: `
      <p class="text-sm text-gray-600 mb-4">Delete the ${T.toLowerCase()} for <strong>${order.product?.name}</strong>? This cannot be undone.</p>
      <div class="flex justify-end gap-2">
        ${btn('Cancel', { variant: 'outline', cls: 'cancel-del' })}
        ${btn('Delete', { variant: 'destructive', cls: 'confirm-del' })}
      </div>` })
    dlg.querySelector('.cancel-del').onclick = () => closeModal('del-modal')
    dlg.querySelector('.confirm-del').onclick = async () => {
      const confirmBtn = dlg.querySelector('.confirm-del')
      confirmBtn.disabled = true; confirmBtn.textContent = 'Deleting…'
      // milestones, documents, checksheet_responses all CASCADE from orders
      await db.from('order_lines').delete().eq('order_id', deleteTarget.id)
      const { error } = await db.from('orders').delete().eq('id', deleteTarget.id)
      if (error) {
        confirmBtn.disabled = false; confirmBtn.textContent = 'Delete'
        const errP = document.createElement('p')
        errP.className = 'text-sm text-red-600 mt-2'
        errP.textContent = error.message
        dlg.querySelector('.confirm-del').parentElement.before(errP)
        return
      }
      closeModal('del-modal')
      const orders = await load()
      renderTable(orders)
    }
  }

  const orders = await load()
  if (orders !== null) renderTable(orders)
}
