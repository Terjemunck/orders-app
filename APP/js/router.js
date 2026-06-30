// ── Router ────────────────────────────────────────────────────────────────────
const routes = [
  { pattern: /^\/orders\/([^/]+)\/milestones\/([^/]+)$/, page: 'milestoneDetail' },
  { pattern: /^\/projects\/([^/]+)\/milestones\/([^/]+)$/, page: 'milestoneDetail' },
  { pattern: /^\/orders\/([^/]+)$/, page: 'orderDetail' },
  { pattern: /^\/projects\/([^/]+)$/, page: 'orderDetail' },
  { pattern: /^\/orders$/, page: 'orders' },
  { pattern: /^\/projects$/, page: 'orders' },
  { pattern: /^\/companies$/, page: 'companies' },
  { pattern: /^\/users$/, page: 'users' },
  { pattern: /^\/products$/, page: 'products' },
  { pattern: /^\/notifications$/, page: 'notifications' },
  { pattern: /^\/settings$/, page: 'settings' },
]

const iconOrder   = 'M3 3h2l.4 2M7 13h10l4-4H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z'
const iconProject = 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01'

// Role → allowed pages
const roleNav = {
  system_mgr: [
    { hash: '#/orders',        label: 'Orders',                icon: iconOrder },
    { hash: '#/projects',      label: 'Projects',              icon: iconProject },
    { hash: '#/companies',     label: 'Companies',             icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
    { hash: '#/users',         label: 'Users',                 icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
    { hash: '#/products',      label: 'Products',              icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
    { hash: '#/notifications', label: 'Notification Log',      icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
    { hash: '#/settings',      label: 'Settings',              icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  ],
  factory: [
    { hash: '#/orders',   label: 'Orders',   icon: iconOrder },
    { hash: '#/projects', label: 'Projects', icon: iconProject },
  ],
  customer: [
    { hash: '#/orders',   label: 'My Orders',   icon: iconOrder },
    { hash: '#/projects', label: 'My Projects', icon: iconProject },
  ],
}

function renderShell() {
  const app = document.getElementById('app')
  const loginScreen = document.getElementById('login-screen')
  const loading = document.getElementById('loading-screen')

  loading.classList.add('hidden')

  if (!auth.session) {
    app.classList.add('hidden')
    app.classList.remove('flex')
    loginScreen.classList.remove('hidden')
    document.getElementById('login-email').value = ''
    document.getElementById('login-password').value = ''
    document.getElementById('login-error').classList.add('hidden')
    setupLoginForm()
    return
  }

  loginScreen.classList.add('hidden')
  app.classList.remove('hidden')
  app.classList.add('flex')

  // Update user info
  document.getElementById('user-name').textContent = auth.profile?.name ?? ''
  document.getElementById('user-company').textContent = auth.profile?.company?.name ?? ''

  // Build sidebar
  const nav = roleNav[auth.companyType] ?? roleNav.customer
  const currentHash = window.location.hash || '#/orders'
  document.getElementById('sidebar-nav').innerHTML = nav.map(item => {
    const active = currentHash.startsWith(item.hash)
    return `<a href="${item.hash}" class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${active ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}">
      <svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${item.icon}"/></svg>
      ${item.label}
    </a>`
  }).join('')

  document.getElementById('signout-btn').onclick = async () => {
    await signOut()
    navigate('#/orders')
  }

  route()
}

function setupLoginForm() {
  const form = document.getElementById('login-form')
  if (form._bound) return
  form._bound = true
  form.onsubmit = async (e) => {
    e.preventDefault()
    const btn = document.getElementById('login-btn')
    const errEl = document.getElementById('login-error')
    btn.disabled = true
    btn.textContent = 'Signing in…'
    errEl.classList.add('hidden')
    const err = await signIn(
      document.getElementById('login-email').value,
      document.getElementById('login-password').value
    )
    if (err) {
      errEl.textContent = err.message
      errEl.classList.remove('hidden')
      btn.disabled = false
      btn.textContent = 'Sign in'
    }
    // On success, onAuthStateChange fires → renderShell
  }

  document.getElementById('forgot-btn').onclick = async () => {
    const email = document.getElementById('login-email').value.trim()
    const errEl = document.getElementById('login-error')
    errEl.classList.add('hidden')
    if (!email) {
      errEl.textContent = 'Enter your email address above first.'
      errEl.classList.remove('hidden')
      return
    }
    const redirectTo = window.location.origin + window.location.pathname
    const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo })
    if (error) {
      errEl.textContent = error.message
      errEl.classList.remove('hidden')
    } else {
      errEl.classList.add('hidden')
      const btn = document.getElementById('forgot-btn')
      btn.textContent = '✓ Check your email for the reset link'
      btn.disabled = true
    }
  }
}

function navigate(hash) {
  window.location.hash = hash
}

function route() {
  const hash = window.location.hash.replace(/^#/, '') || '/orders'
  const content = document.getElementById('content')

  // Update active nav
  document.querySelectorAll('#sidebar-nav a').forEach(a => {
    const active = hash.startsWith(a.getAttribute('href').replace('#', ''))
    a.className = `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${active ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`
  })

  for (const r of routes) {
    const m = hash.match(r.pattern)
    if (m) {
      content.innerHTML = '<div class="p-6 text-sm text-gray-400">Loading…</div>'
      const params = m.slice(1)
      const renderFn = window['render_' + r.page]
      if (renderFn) renderFn(content, ...params)
      return
    }
  }

  // Default
  if (window.render_orders) window.render_orders(content)
}

window.addEventListener('hashchange', () => {
  if (auth.session) route()
})

// ── Boot ──────────────────────────────────────────────────────────────────────
;(async () => {
  // Detect password reset link before anything renders
  if (window.location.hash.includes('type=recovery')) {
    auth.inRecovery = true
  }
  await initAuth()
  if (auth.inRecovery) {
    showResetScreen()
  } else {
    renderShell()
  }
})()
