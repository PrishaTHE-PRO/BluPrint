/**
 * Settings: the birthday has to be a real, complete date between 1900-01-01
 * and today.
 *
 * Every page's settings popup has #settings-birthday and #settings-save-btn,
 * each with its own save code, so this guards them all in one place:
 *  - the date picker only offers dates in that range;
 *  - nothing is checked while typing (a half-typed year like 0002 would
 *    otherwise flash errors on every keystroke);
 *  - on Save, a bad date is stopped before the page's own save handler runs
 *    (the click is caught on the way down), the field turns red and a message
 *    under it says what to enter;
 *  - editing the field clears the error, and the next Save with a good date
 *    goes through to the page's normal save.
 *
 * Dates are compared as numbers, not text: a date input accepts years past
 * 9999, and "12026-01-01" sorts before "2026-11-18" as text.
 */
(function birthdayGuard() {
  var MIN = '1900-01-01';
  var MSG_RANGE = 'Not a valid birthday. Please enter a date between 01/01/1900 and today.';
  var MSG_INCOMPLETE = 'Not a valid birthday. Please enter the full date (MM/DD/YYYY).';

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  // "YYYY-MM-DD" (or a longer year) -> a sortable number, e.g. 20261118.
  function toNum(value) {
    var m = /^(\d{4,})-(\d{2})-(\d{2})$/.exec(value || '');
    return m ? Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]) : NaN;
  }
  // What's wrong with the field, or '' when it's fine (an empty field is fine).
  function problem(el) {
    if (el.validity && el.validity.badInput) return MSG_INCOMPLETE; // partly typed
    if (!el.value) return '';
    var n = toNum(el.value);
    if (isNaN(n) || n > toNum(today()) || n < toNum(MIN)) return MSG_RANGE;
    return '';
  }

  function input() { return document.getElementById('settings-birthday'); }
  function errorLine(el, create) {
    var line = document.getElementById('settings-birthday-error');
    if (!line && create && el) {
      line = document.createElement('p');
      line.id = 'settings-birthday-error';
      line.className = 'settings-birthday-error';
      line.setAttribute('role', 'alert');
      el.insertAdjacentElement('afterend', line);
      el.setAttribute('aria-describedby', line.id);
    }
    return line;
  }
  function showError(el, msg) {
    el.classList.add('settings-birthday-invalid');
    el.setAttribute('aria-invalid', 'true');
    var line = errorLine(el, true);
    line.textContent = msg;
    line.hidden = false;
    var status = document.getElementById('settings-save-status');
    if (status) status.textContent = '';
  }
  function clearError(el) {
    if (!el) return;
    el.classList.remove('settings-birthday-invalid');
    el.removeAttribute('aria-invalid');
    var line = errorLine(el, false);
    if (line) { line.textContent = ''; line.hidden = true; }
  }
  function setLimits(el) {
    if (!el) return;
    el.min = MIN;
    el.max = today();
  }

  // Red field + message; same look on every page, light and dark.
  var style = document.createElement('style');
  style.textContent =
    '.settings-field input.settings-birthday-invalid{border-color:#c0392b!important}' +
    '.settings-birthday-error{margin:8px 2px 0;color:#c0392b;font-size:13px;font-weight:600;line-height:1.4}' +
    'html.dark-mode .settings-field input.settings-birthday-invalid{border-color:#ff8a7a!important}' +
    'html.dark-mode .settings-birthday-error{color:#ff8a7a}';
  document.head.appendChild(style);

  setLimits(input());
  // Keep the picker's limits current (the date can roll over while the page is open).
  document.addEventListener('focusin', function (e) { if (e.target === input()) setLimits(e.target); });
  // Any edit clears an error from the last Save; nothing is checked while typing.
  document.addEventListener('input', function (e) { if (e.target === input()) clearError(e.target); });
  // Opening or closing the popup starts clean.
  document.addEventListener('click', function (e) {
    if (e.target && e.target.closest && e.target.closest('#settings-btn, #settings-close-btn')) clearError(input());
  });

  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest && e.target.closest('#settings-save-btn');
    if (!btn) return;
    var el = input();
    if (!el) return;
    setLimits(el);
    var msg = problem(el);
    if (!msg) { clearError(el); return; } // good date: the page's own save runs
    e.preventDefault();
    e.stopImmediatePropagation();
    showError(el, msg);
    el.focus();
  }, true);
})();
