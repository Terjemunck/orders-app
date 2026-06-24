window.render_notifications = async function(container) {
  container.innerHTML = '<div class="p-6 text-sm text-gray-400">Loading…</div>'

  const { data: logs } = await db
    .from('notification_log')
    .select('*, user:users(name)')
    .order('sent_at', { ascending: false })
    .limit(200)

  if (!logs?.length) {
    container.innerHTML = `<div class="p-6 page-enter">
      <h1 class="text-xl font-semibold mb-1">Notification Log</h1>
      <p class="text-sm text-gray-500 mt-1 mb-6">Last 200 notifications sent by the system.</p>
      <p class="text-sm text-gray-400">No notifications sent yet.</p>
    </div>`
    return
  }

  // Fetch order metadata for all order numbers in the log
  const orderNumbers = [...new Set(logs.map(l => l.order_number).filter(Boolean))]
  const { data: orderMeta } = orderNumbers.length
    ? await db.from('orders').select('order_number, type, product:products(name)').in('order_number', orderNumbers)
    : { data: [] }
  const orderMetaMap = {}
  for (const o of orderMeta ?? []) orderMetaMap[o.order_number] = o

  // Group by order_number
  const grouped = {}
  for (const log of logs) {
    const key = log.order_number ?? '__other__'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(log)
  }

  function typePill(type, milestoneName) {
    if (type === 'milestone_completed') {
      const label = milestoneName ? `${milestoneName} · completed` : 'Milestone completed'
      return badge(label, 'success')
    }
    if (type === 'milestone_started') {
      const label = milestoneName ? `${milestoneName} · started` : 'Milestone started'
      return badge(label, 'info')
    }
    if (type === 'order_created')     return badge('Order created', 'default')
    if (type === 'order_completed')   return badge('Order completed', 'success')
    if (type === 'stage_started')     return badge('Stage started', 'info')
    if (type === 'stage_completed')   return badge('Stage completed', 'success')
    if (type === 'document_uploaded') return badge('Document uploaded', 'warning')
    return badge(type, 'default')
  }

  const resendable = new Set(['milestone_started', 'milestone_completed', 'order_created'])

  function renderRows(entries) {
    return entries.map(log => `
      <tr class="hover:bg-gray-50">
        <td class="px-4 py-2.5 text-gray-400 whitespace-nowrap text-xs">${new Date(log.sent_at).toLocaleString()}</td>
        <td class="px-4 py-2.5">${typePill(log.notification_type, log.milestone_name)}</td>
        <td class="px-4 py-2.5 text-gray-700 text-sm">${log.user?.name ?? '—'}</td>
        <td class="px-4 py-2.5 text-gray-500 text-sm">${log.email}</td>
        <td class="px-4 py-2.5">
          ${log.status !== 'sent' ? badge('Failed', 'destructive') : ''}
        </td>
        <td class="px-4 py-2.5 text-right">
          ${resendable.has(log.notification_type)
            ? `<button class="resend-btn text-xs px-2.5 py-1 rounded border border-gray-200 text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors" data-log-id="${log.id}">Resend</button>`
            : ''}
        </td>
      </tr>`).join('')
  }

  const orderKeys = Object.keys(grouped).sort((a, b) => {
    if (a === '__other__') return 1
    if (b === '__other__') return -1
    return Number(b) - Number(a)
  })

  const accordions = orderKeys.map((key, i) => {
    const entries = grouped[key]
    const count = entries.length
    const id = `notif-group-${i}`
    const rows = renderRows(entries)

    let headerHtml
    if (key === '__other__') {
      headerHtml = `<span class="font-medium text-sm text-gray-800">Other notifications</span>`
    } else {
      const meta = orderMetaMap[key]
      const productName = meta?.product?.name ?? '—'
      const typeLabel = meta?.type === 'project' ? 'Project' : 'Order'
      headerHtml = `
        <span class="flex items-center gap-6">
          <span class="text-sm font-semibold text-gray-800 w-10">#${key}</span>
          <span class="text-sm text-gray-700">${productName}</span>
          <span class="text-xs text-gray-400">${typeLabel}</span>
        </span>`
    }

    return `
      <div class="border border-gray-200 rounded-lg mb-2 overflow-hidden">
        <button onclick="toggleNotifGroup('${id}')"
          class="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left transition-colors">
          ${headerHtml}
          <span class="flex items-center gap-2">
            <span class="text-xs text-gray-400">${count} email${count !== 1 ? 's' : ''}</span>
            <svg id="${id}-chevron" class="h-4 w-4 text-gray-400 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
            </svg>
          </span>
        </button>
        <div id="${id}" class="hidden">
          <table class="w-full text-sm">
            <thead class="border-b border-gray-100 bg-white">
              <tr>${['Sent','Event','Recipient','Email','',''].map(h => `<th class="px-4 py-2 text-left text-xs font-medium text-gray-500">${h}</th>`).join('')}</tr>
            </thead>
            <tbody class="divide-y divide-gray-50">${rows}</tbody>
          </table>
        </div>
      </div>`
  }).join('')

  container.innerHTML = `<div class="p-6 page-enter">
    <div class="mb-6">
      <h1 class="text-xl font-semibold">Notification Log</h1>
      <p class="text-sm text-gray-500 mt-1">Last 200 notifications, grouped by order.</p>
    </div>
    ${accordions}
  </div>`

  container.querySelectorAll('.resend-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const logId = btn.dataset.logId
      btn.disabled = true
      btn.textContent = 'Sending…'
      try {
        const { data: { session } } = await db.auth.getSession()
        const res = await fetch(`${SUPABASE_URL}/functions/v1/resend-notification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({ log_id: logId }),
        })
        if (res.ok) {
          btn.textContent = 'Sent ✓'
          btn.classList.add('text-green-600', 'border-green-300')
          setTimeout(() => { btn.textContent = 'Resend'; btn.disabled = false; btn.classList.remove('text-green-600', 'border-green-300') }, 3000)
        } else {
          const err = await res.json()
          btn.textContent = 'Failed'
          btn.classList.add('text-red-600')
          console.error('Resend failed:', err)
          setTimeout(() => { btn.textContent = 'Resend'; btn.disabled = false; btn.classList.remove('text-red-600') }, 3000)
        }
      } catch (err) {
        console.error('Resend error:', err)
        btn.textContent = 'Error'
        btn.disabled = false
      }
    })
  })
}

window.toggleNotifGroup = function(id) {
  const el = document.getElementById(id)
  const chevron = document.getElementById(`${id}-chevron`)
  if (!el) return
  el.classList.toggle('hidden')
  chevron?.classList.toggle('rotate-180')
}
