/**
 * Settings: the birthday can't be in the future.
 * Every page's settings popup has #settings-birthday and #settings-save-btn,
 * each with its own save code, so this guards them all in one place: the
 * date picker stops at today, and a typed future date blocks Save (the click
 * is caught on the way down, before the page's own save handler runs).
 */
(function birthdayGuard() {
  var MSG = "Birthday can't be in the future.";

  function today() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }
  function input() { return document.getElementById('settings-birthday'); }
  function isFuture(el) { return !!(el && el.value && el.value > today()); }
  function say(text) {
    var status = document.getElementById('settings-save-status');
    if (status) status.textContent = text;
  }
  function check(el) {
    if (!el) return;
    el.max = today();
    el.setCustomValidity(isFuture(el) ? MSG : '');
    if (isFuture(el)) say(MSG);
    else if (document.getElementById('settings-save-status') && document.getElementById('settings-save-status').textContent === MSG) say('');
  }

  // Set the limit now and again whenever the field is used (the date can
  // roll over while the page stays open).
  check(input());
  document.addEventListener('focusin', function (e) { if (e.target === input()) check(e.target); });
  document.addEventListener('input', function (e) { if (e.target === input()) check(e.target); });
  document.addEventListener('change', function (e) { if (e.target === input()) check(e.target); });

  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest && e.target.closest('#settings-save-btn');
    if (!btn) return;
    var el = input();
    if (!isFuture(el)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    check(el);
    el.reportValidity();
  }, true);
})();
