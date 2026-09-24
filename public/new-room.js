/**
 * "New Room" has to start from a blank canvas.
 *
 * room-dimensions.html restores whatever blueprintCurrentRoomId /
 * blueprintRoomLayout point at, and saves with PATCH when an id is present. So
 * a New Room link that does not clear those keys does two bad things at once:
 * the editor opens on the previous room, and saving PATCHes that old room
 * instead of creating a new one — which is why a "new" room never appeared on
 * the dashboard. If the stored id belonged to a deleted room the PATCH 404s,
 * the save is swallowed as "Saved locally — continuing", and the room is lost.
 *
 * past-inspiration.html did this inline for links present at load. That missed
 * the dashboard's New Room button entirely, and the mobile dock's "+ New room"
 * FAB, which mobile-ui.js injects after load. Hence: one delegated listener,
 * driven by an explicit [data-new-room] marker.
 *
 * The marker matters — the mobile "Pick up where you left off" rows also point
 * at room-dimensions.html, and those are supposed to resume, not reset.
 */
(function () {
  var KEYS = [
    'blueprintCurrentRoomId',
    'blueprintCurrentRoomName',
    'blueprintCurrentRoomWidth',
    'blueprintCurrentRoomLength',
    'blueprintCurrentRoomHeight',
    'blueprintCurrentRoomType',
    'blueprintStyleResult',
    'blueprintRoomLayout',
    'blueprintBudgetTotal',
    // Photo mode. Left out of this list at first, so New Room reopened the
    // editor with the previous room's photo already in the drop zone.
    'blueprintCurrentRoomPhotoUrl',
  ];

  function startNewRoom() {
    try {
      KEYS.forEach(function (key) { localStorage.removeItem(key); });
    } catch (err) {
      // Private mode / storage disabled: navigation should still work.
      console.warn('[new-room] could not clear stored room', err);
    }
  }

  // Capture phase, so the keys are gone before the browser follows the link.
  // Delegated, so links injected later (the mobile dock FAB) are covered too.
  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
    if (target.closest('[data-new-room]')) startNewRoom();
  }, true);

  window.blueprintStartNewRoom = startNewRoom;
})();
