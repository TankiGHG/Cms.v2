(function () {
    'use strict';

    // Already signed in? Go straight to the panel.
    fetch('/api/auth/me').then(r => r.json()).then(d => {
        if (d && d.user) location.href = '/admin/';
    }).catch(() => {});

    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const feedback = document.getElementById('login-feedback');
        feedback.textContent = '';
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: document.getElementById('username').value,
                    password: document.getElementById('password').value,
                }),
            });
            const result = await res.json();
            if (res.ok) {
                location.href = '/admin/';
            } else {
                feedback.textContent = result.error || 'Login failed.';
            }
        } catch {
            feedback.textContent = 'Network error. Please try again.';
        }
    });
})();
