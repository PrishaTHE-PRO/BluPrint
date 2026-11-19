import { useEffect, useRef, useState } from 'react';

/** Today as YYYY-MM-DD in the visitor's time zone (what a date input uses). */
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const BIRTHDAY_MIN = '1900-01-01';
/** "YYYY-MM-DD" (or a longer year) as a sortable number. Compared as numbers,
 *  not text: a date input accepts years past 9999, and "12026-01-01" < "2026-11-18" as text. */
function dateNum(value: string) {
  const m = /^(\d{4,})-(\d{2})-(\d{2})$/.exec(value);
  return m ? Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]) : NaN;
}
/** What's wrong with the birthday field, or '' when it's fine (empty is fine).
 *  Same rules and wording as public/birthday-guard.js. Checked on Save only. */
function birthdayProblem(input: HTMLInputElement | null, value: string) {
  if (input?.validity.badInput) return 'Not a valid birthday. Please enter the full date (MM/DD/YYYY).';
  if (!value) return '';
  const n = dateNum(value);
  if (Number.isNaN(n) || n > dateNum(localToday()) || n < dateNum(BIRTHDAY_MIN)) {
    return 'Not a valid birthday. Please enter a date between 01/01/1900 and today.';
  }
  return '';
}
import { createPortal } from 'react-dom';

function readStoredName() {
  return localStorage.getItem('blueprintUserName') || 'Account';
}

export default function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [name, setName] = useState(readStoredName);
  const [email, setEmail] = useState('Manage your BluPrint profile');
  const [nameDraft, setNameDraft] = useState(readStoredName);
  const [birthdayDraft, setBirthdayDraft] = useState(
    () => localStorage.getItem('blueprintUserBirthday') || '',
  );
  const [saveStatus, setSaveStatus] = useState('');
  const [birthdayError, setBirthdayError] = useState('');
  const birthdayRef = useRef<HTMLInputElement>(null);
  const [popupPos, setPopupPos] = useState({ top: 64, right: 12 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (popupRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  useEffect(() => {
    if (!open) return;

    const placePopup = () => {
      const anchor = btnRef.current ?? wrapRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      setPopupPos({
        top: Math.round(rect.bottom + 12),
        right: Math.max(12, Math.round(window.innerWidth - rect.right)),
      });
    };

    placePopup();
    window.addEventListener('resize', placePopup);
    window.addEventListener('scroll', placePopup, true);
    return () => {
      window.removeEventListener('resize', placePopup);
      window.removeEventListener('scroll', placePopup, true);
    };
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;
    (async () => {
      try {
        const { auth, isFirebaseConfigured } = await import('../../firebase.mjs');
        const { onAuthStateChanged } = await import('firebase/auth');
        if (!isFirebaseConfigured?.() || !auth) return;
        unsub = onAuthStateChanged(auth, (user) => {
          if (cancelled || !user) return;
          const nextName = user.displayName || localStorage.getItem('blueprintUserName') || user.email?.split('@')[0] || 'Account';
          localStorage.setItem('blueprintUserName', nextName);
          setName(nextName);
          setEmail(user.email || 'Manage your BluPrint profile');
          setNameDraft(nextName);
        });
      } catch {
        /* firebase optional on this page */
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  const openSettings = () => {
    setNameDraft(localStorage.getItem('blueprintUserName') || name || '');
    setBirthdayDraft(localStorage.getItem('blueprintUserBirthday') || '');
    setSaveStatus('');
    setBirthdayError('');
    setOpen(false);
    setSettingsOpen(true);
  };

  const saveSettings = async () => {
    // The birthday has to be a complete date between 1900 and today.
    const problem = birthdayProblem(birthdayRef.current, birthdayDraft);
    if (problem) {
      setBirthdayError(problem);
      setSaveStatus('');
      birthdayRef.current?.focus();
      return;
    }
    setBirthdayError('');
    const next = nameDraft.trim();
    try {
      if (next) {
        localStorage.setItem('blueprintUserName', next);
        setName(next);
        try {
          const { auth } = await import('../../firebase.mjs');
          const { updateProfile } = await import('firebase/auth');
          if (auth?.currentUser) await updateProfile(auth.currentUser, { displayName: next });
        } catch { /* ignore */ }
      }
      if (birthdayDraft) localStorage.setItem('blueprintUserBirthday', birthdayDraft);
      setSaveStatus('Saved!');
      setTimeout(() => setSaveStatus(''), 2000);
    } catch (err) {
      setSaveStatus(err instanceof Error ? `Error: ${err.message}` : 'Error saving');
    }
  };

  const signOutUser = async () => {
    try {
      const { auth } = await import('../../firebase.mjs');
      const { signOut } = await import('firebase/auth');
      if (auth) await signOut(auth);
    } catch { /* ignore */ }
    window.location.href = '/login.html';
  };

  const popup = (
    <div
      ref={popupRef}
      className={`profile-popup profile-popup-fixed${open ? '' : ' hidden'}`}
      role="menu"
      style={{
        top: popupPos.top,
        right: popupPos.right,
        ['--profile-popup-top' as string]: `${popupPos.top}px`,
        ['--profile-popup-right' as string]: `${popupPos.right}px`,
      }}
    >
      <div className="profile-popup-header">
        <div className="profile-popup-avatar" aria-hidden="true">
          <iconify-icon icon="ph:user" />
        </div>
        <div className="profile-popup-identity">
          <p className="profile-popup-name">{name}</p>
          <p className="profile-popup-email">{email}</p>
        </div>
      </div>
      <div className="profile-popup-section">
        <p className="profile-popup-label">Account</p>
        <button type="button" className="profile-popup-item" role="menuitem" onClick={openSettings}>
          <span className="profile-popup-item-icon"><iconify-icon icon="ph:gear-duotone" /></span>
          <span className="profile-popup-item-copy">
            <strong>Settings</strong>
            <small>Name, birthday &amp; preferences</small>
          </span>
        </button>
      </div>
      <div className="profile-popup-footer">
        <button type="button" className="profile-popup-item profile-popup-item-danger" role="menuitem" onClick={signOutUser}>
          <span className="profile-popup-item-icon"><iconify-icon icon="ph:sign-out-duotone" /></span>
          <span className="profile-popup-item-copy">
            <strong>Sign out</strong>
            <small>Come back anytime</small>
          </span>
        </button>
      </div>
    </div>
  );

  const settings = (
    <div
      className={`settings-overlay${settingsOpen ? '' : ' hidden'}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) setSettingsOpen(false);
      }}
    >
      <div className="settings-modal">
        <button
          type="button"
          className="settings-modal-close"
          aria-label="Close settings"
          onClick={() => setSettingsOpen(false)}
        >
          <iconify-icon icon="ph:x-bold" />
        </button>
        <h2>Settings</h2>
        <p style={{ color: 'var(--bp-muted)', fontSize: 14, margin: '0 0 24px' }}>
          Update your profile details.
        </p>
        <div className="settings-field">
          <label htmlFor="result-settings-name">Display name</label>
          <input
            id="result-settings-name"
            type="text"
            placeholder="Your name"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
          />
        </div>
        <div className="settings-field">
          <label htmlFor="result-settings-birthday">Birthday</label>
          <input
            ref={birthdayRef}
            id="result-settings-birthday"
            type="date"
            value={birthdayDraft}
            min={BIRTHDAY_MIN}
            max={localToday()}
            aria-invalid={birthdayError ? true : undefined}
            aria-describedby={birthdayError ? 'result-settings-birthday-error' : undefined}
            style={birthdayError ? { borderColor: '#c0392b' } : undefined}
            onInput={() => setBirthdayError('')}
            onChange={(e) => setBirthdayDraft(e.target.value)}
          />
          {birthdayError && (
            <p
              id="result-settings-birthday-error"
              role="alert"
              style={{ margin: '8px 2px 0', color: '#c0392b', fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}
            >
              {birthdayError}
            </p>
          )}
        </div>
        <button type="button" className="settings-save-btn" onClick={saveSettings}>
          Save changes
        </button>
        <span className="settings-save-status">{saveStatus}</span>
        <hr className="settings-divider" />
        <div className="settings-contact">
          <h3>Need help?</h3>
          <ul>
            <li><strong>Aditi Amarnath</strong>: <a href="mailto:aamarnath@wisc.edu">aamarnath@wisc.edu</a></li>
            <li><strong>Nidhi Gandhi</strong>: <a href="mailto:nvgandhi@wisc.edu">nvgandhi@wisc.edu</a></li>
            <li><strong>Prisha Agarwalla</strong>: <a href="mailto:prishaagarwalla50@gmail.com">prishaagarwalla50@gmail.com</a></li>
            <li><strong>Saanvi Gandhari</strong>: <a href="mailto:saanvi.gandhari@gmail.com">saanvi.gandhari@gmail.com</a></li>
          </ul>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="profile-menu-wrap" ref={wrapRef}>
        <button
          ref={btnRef}
          type="button"
          className="profile-btn"
          aria-label="Account menu"
          aria-haspopup="true"
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          <iconify-icon icon="ph:user" />
        </button>
      </div>
      {typeof document !== 'undefined' && createPortal(popup, document.body)}
      {typeof document !== 'undefined' && createPortal(settings, document.body)}
    </>
  );
}
