const form = document.getElementById('form');
const errorBox = document.getElementById('error');
const button = document.getElementById('submit');

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.textContent = '';
    button.disabled = true;

    try {
        const response = await fetch('/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: document.getElementById('token').value }),
        });
        const data = await response.json().catch(() => ({}));

        if (response.ok) {
            window.location.href = '/admin';
            return;
        }
        errorBox.textContent = data.error || 'Sign in failed.';
    } catch {
        errorBox.textContent = 'Could not reach the server.';
    } finally {
        button.disabled = false;
    }
});
