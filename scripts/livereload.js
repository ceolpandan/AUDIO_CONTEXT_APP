// Simple client for SSE-based livereload server
(function () {
  if (typeof EventSource === 'undefined') return;
  const es = new EventSource('/events');
  es.addEventListener('reload', function (ev) {
    try {
      console.log('[livereload] reload event received');
      // give a small timeout so multiple quick edits don't reload before page settles
      setTimeout(function () {
        location.reload();
      }, 50);
    } catch (e) {
      console.error(e);
    }
  });
  es.onopen = function () {
    console.log('[livereload] connected');
  };
  es.onerror = function (e) {
    // Do not spam the console when server not running
  };
})();
