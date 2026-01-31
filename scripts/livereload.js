// Simple client for SSE-based livereload server
(() => {
    if (typeof EventSource === 'undefined') {
        return;
    }
    const es = new EventSource('/events');
    es.addEventListener('reload', (_ev) => {
        try {
            console.log('[livereload] reload event received');
            // give a small timeout so multiple quick edits don't reload before page settles
            setTimeout(() => {
                location.reload();
            }, 50);
        } catch (e) {
            console.error(e);
        }
    });
    es.onopen = () => {
        console.log('[livereload] connected');
    };
    es.onerror = (_e) => {
        // Do not spam the console when server not running
    };
})();
