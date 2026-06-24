window.render_users = async function(container) {
  container.innerHTML = '<div class="p-6 text-sm text-gray-400">Loading…</div>'
  let editing = null

  const NOTIF_LABELS = {
    order_created: 'Order created', stage_started: 'Stage started', stage_completed: 'Stage completed',
    order_completed: 'Order completed', milestone_completed: 'Milestone completed', document_uploaded: 'Document uploaded',
  }
  const NOTIF_TYPES = Object.keys(NOTIF_LABELS)

  async function load() {
    const [{ data: u }, { data: c }] = await Promise.all([
      db.from('users').select('*, company:companies(name)').order('name'),
      db.from('companies').select('id, name').order('name'),
    ])
    return { users: u ?? [], companies: c ?? [] }
  }

  function renderTable({ users, companies }) {
    const rows = users.map(u => `<tr class="hover:bg-gray-50">
      <td class="px-4 py-3 font-medium">${u.name}</td>
      <td class="px-4 py-3 text-gray-600">${u.email}</td>
      <td class="px-4 py-3 text-gray-600">${u.company?.name ?? '—'}</td>
      <td class="px-4 py-3">${badge(u.role, u.role === 'manager' ? 'info' : 'default')}</td>
      <td class="px-4 py-3"><div class="flex items-center gap-1 justify-end">
        <button class="p-1 text-gray-400 hover:text-gray-700 rounded edit-btn" data-id="${u.id}">${icons.pencil}</button>
        <button class="p-1 text-gray-400 hover:text-red-500 rounded del-btn" data-id="${u.id}">${icons.trash}</button>
      </div></td>
    </tr>`).join('')

    container.innerHTML = `<div class="p-6 page-enter">
      ${pageHeader('Users', btn(`${icons.plus} New User`, { size: 'sm', cls: 'new-btn' }))}
      ${users.length ? tableWrap(['Name','Email','Company','Role',''], rows) : '<p class="text-sm text-gray-400">No users yet.</p>'}
    </div>`

    container.querySelector('.new-btn').onclick = () => openForm(null, companies)
    container.querySelectorAll('.edit-btn').forEach(b => b.onclick = async () => {
      const user = users.find(u => u.id === b.dataset.id)
      const { data: prefs } = await db.from('user_notification_preferences').select('notification_type, enabled').eq('user_id', user.id)
      const prefsMap = {}
      for (const p of prefs ?? []) prefsMap[p.notification_type] = p.enabled
      openForm(user, companies, prefsMap)
    })
    container.querySelectorAll('.del-btn').forEach(b => b.onclick = () => openDelete(users.find(u => u.id === b.dataset.id)))
  }

  function openForm(user, companies, notifPrefs = {}) {
    editing = user
    const companyOpts = companies.map(c => `<option value="${c.id}" ${c.id === user?.company_id ? 'selected' : ''}>${c.name}</option>`).join('')

    const notifHtml = user && Object.keys(notifPrefs).length ? `
      <div class="space-y-1.5">
        <label class="text-sm font-medium text-gray-700">Email Notifications</label>
        <div class="rounded border divide-y">
          ${NOTIF_TYPES.filter(t => t in notifPrefs).map(t => `
            <label class="flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
              <span>${NOTIF_LABELS[t]}</span>
              <input type="checkbox" name="notif_${t}" ${notifPrefs[t] ? 'checked' : ''} class="h-4 w-4 rounded border-gray-300 text-blue-600" />
            </label>`).join('')}
        </div>
      </div>` : ''

    const body = `<form id="user-form" class="space-y-4">
      ${formField('Full Name', `<input name="name" value="${user?.name ?? ''}" required class="${inputCls()}" />`)}
      ${formField('Email', `<input type="email" name="email" value="${user?.email ?? ''}" required class="${inputCls()}" ${!user ? '' : ''} />`)}
      ${!user ? `<p class="text-xs text-gray-500">An invite email will be sent so the user can set their own password.</p>` : ''}
      <div class="grid grid-cols-2 gap-3">
        ${formField('Role', `<select name="role" class="${inputCls()}">
          <option value="user" ${user?.role === 'user' ? 'selected' : ''}>User</option>
          <option value="manager" ${user?.role === 'manager' ? 'selected' : ''}>Manager</option>
        </select>`)}
        ${formField('Company', `<select name="company_id" class="${inputCls()}">
          <option value="">Select</option>${companyOpts}
        </select>`)}
      </div>
      ${notifHtml}
      <p id="user-error" class="hidden text-sm text-red-600"></p>
      <div class="flex justify-end gap-2 pt-2">
        ${btn('Cancel', { variant: 'outline', cls: 'cancel-btn' })}
        ${btn(user ? 'Save' : 'Send Invite', { type: 'submit', cls: 'submit-btn' })}
      </div>
    </form>`

    const dlg = showModal({ id: 'user-modal', title: user ? 'Edit User' : 'New User', body })
    dlg.querySelector('.cancel-btn').onclick = () => closeModal('user-modal')
    dlg.querySelector('#user-form').onsubmit = async (e) => {
      e.preventDefault()
      const errEl = dlg.querySelector('#user-error')
      errEl.classList.add('hidden')
      const fd = new FormData(e.target)
      const submitBtn = dlg.querySelector('.submit-btn')
      submitBtn.disabled = true; submitBtn.textContent = 'Saving…'

      if (editing) {
        // Email change — call edge function if changed
        const newEmail = fd.get('email')?.trim()
        if (newEmail && newEmail !== editing.email) {
          const { data: { session } } = await db.auth.getSession()
          const res = await fetch(`${SUPABASE_URL}/functions/v1/update-user-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify({ user_id: editing.id, new_email: newEmail }),
          })
          const result = await res.json()
          if (!res.ok) { errEl.textContent = result.error ?? 'Failed to update email'; errEl.classList.remove('hidden'); submitBtn.disabled = false; submitBtn.textContent = 'Save'; return }
        }

        const { error: dbErr } = await db.from('users').update({
          name: fd.get('name'), role: fd.get('role'), company_id: fd.get('company_id') || null,
        }).eq('id', editing.id)
        if (dbErr) { errEl.textContent = dbErr.message; errEl.classList.remove('hidden'); submitBtn.disabled = false; submitBtn.textContent = 'Save'; return }

        const upserts = NOTIF_TYPES.filter(t => t in notifPrefs).map(t => ({
          user_id: editing.id, notification_type: t, enabled: fd.get(`notif_${t}`) === 'on'
        }))
        if (upserts.length) await db.from('user_notification_preferences').upsert(upserts, { onConflict: 'user_id,notification_type' })
      } else {
        const { data: { session } } = await db.auth.getSession()
        const res = await fetch(`${SUPABASE_URL}/functions/v1/invite-user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({
            email: fd.get('email')?.trim(),
            name: fd.get('name')?.trim(),
            role: fd.get('role'),
            company_id: fd.get('company_id') || null,
          }),
        })
        const result = await res.json()
        if (!res.ok) { errEl.textContent = result.error ?? 'Failed to send invite'; errEl.classList.remove('hidden'); submitBtn.disabled = false; submitBtn.textContent = 'Send Invite'; return }
      }

      closeModal('user-modal')
      renderTable(await load())
    }
  }

  function openDelete(user) {
    const dlg = showModal({ id: 'del-modal', title: 'Delete User', body: `
      <p class="text-sm text-gray-600 mb-4">Delete <strong>${user.name}</strong>? This cannot be undone.</p>
      <div class="flex justify-end gap-2">
        ${btn('Cancel', { variant: 'outline', cls: 'cancel-del' })}
        ${btn('Delete', { variant: 'destructive', cls: 'confirm-del' })}
      </div>` })
    dlg.querySelector('.cancel-del').onclick = () => closeModal('del-modal')
    dlg.querySelector('.confirm-del').onclick = async () => {
      await db.from('users').delete().eq('id', user.id)
      closeModal('del-modal')
      renderTable(await load())
    }
  }

  renderTable(await load())
}
