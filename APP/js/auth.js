// Global auth state
const auth = {
  session: null,
  profile: null,
  companyType: null,
  companyStage: null,
  isManager: false,
  inRecovery: false,
}

async function loadProfile(userId) {
  const { data } = await db.from('users').select('*, company:companies(*)').eq('id', userId).single()
  return data
}

async function initAuth() {
  // Detect invite link: Supabase appends #access_token=...&type=invite to the redirect URL
  const hashParams = new URLSearchParams(window.location.hash.slice(1))
  if (hashParams.get('type') === 'invite') {
    auth._pendingInvite = true
  }

  const { data: { session } } = await db.auth.getSession()
  auth.session = session
  if (session) {
    auth.profile = await loadProfile(session.user.id)
    auth.companyType = auth.profile?.company?.type ?? null
    auth.companyStage = auth.profile?.company?.stage_number ?? null
    auth.isManager = auth.profile?.role === 'manager'
  }

  db.auth.onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY' || (auth._pendingInvite && event === 'SIGNED_IN')) {
      auth._pendingInvite = false
      auth.inRecovery = true
      // Update screen title for invite vs recovery
      const titleEl = document.querySelector('#reset-screen h1')
      const subtitleEl = document.querySelector('#reset-screen p')
      if (event === 'SIGNED_IN' && titleEl) {
        titleEl.textContent = 'Welcome! Set your password'
        if (subtitleEl) subtitleEl.textContent = 'Choose a password to activate your account'
      }
      showResetScreen()
      return
    }
    if (auth.inRecovery) return  // Don't let other events override the reset screen
    auth.session = session
    if (session) {
      auth.profile = await loadProfile(session.user.id)
      auth.companyType = auth.profile?.company?.type ?? null
      auth.companyStage = auth.profile?.company?.stage_number ?? null
      auth.isManager = auth.profile?.role === 'manager'
    } else {
      auth.profile = null
      auth.companyType = null
      auth.companyStage = null
      auth.isManager = false
    }
    renderShell()
  })
}

function showResetScreen() {
  document.getElementById('loading-screen').classList.add('hidden')
  document.getElementById('login-screen').classList.add('hidden')
  document.getElementById('app').classList.add('hidden')
  document.getElementById('app').classList.remove('flex')
  const resetScreen = document.getElementById('reset-screen')
  resetScreen.classList.remove('hidden')

  const form = document.getElementById('reset-form')
  if (form._bound) return
  form._bound = true
  form.onsubmit = async (e) => {
    e.preventDefault()
    const btn = document.getElementById('reset-btn')
    const errEl = document.getElementById('reset-error')
    const okEl = document.getElementById('reset-success')
    const pw = document.getElementById('reset-password').value
    const pw2 = document.getElementById('reset-password-confirm').value
    errEl.classList.add('hidden')
    okEl.classList.add('hidden')
    if (pw !== pw2) { errEl.textContent = 'Passwords do not match.'; errEl.classList.remove('hidden'); return }
    btn.disabled = true; btn.textContent = 'Saving…'
    const { error } = await db.auth.updateUser({ password: pw })
    if (error) {
      errEl.textContent = error.message
      errEl.classList.remove('hidden')
      btn.disabled = false; btn.textContent = 'Set password'
      return
    }
    okEl.textContent = 'Password updated! Taking you to the app…'
    okEl.classList.remove('hidden')
    setTimeout(() => {
      auth.inRecovery = false
      resetScreen.classList.add('hidden')
      renderShell()
    }, 1500)
  }
}

async function signIn(email, password) {
  const { error } = await db.auth.signInWithPassword({ email, password })
  return error
}

async function signOut() {
  await db.auth.signOut()
}
