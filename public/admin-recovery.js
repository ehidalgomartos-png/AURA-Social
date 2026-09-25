const form = document.getElementById('recoveryForm');
const msg = document.getElementById('msg');

if (form) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    msg.textContent = 'Actualizando contraseña...';

    const data = new FormData(form);

    try {
      const response = await fetch('/api/auth/admin-recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: data.get('email'),
          token: data.get('token'),
          newPassword: data.get('newPassword')
        })
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        const labels = {
          recovery_disabled: 'La recuperación no está habilitada.',
          invalid_recovery_credentials: 'Email o token de recuperación incorrectos.',
          invalid_password_length: 'La contraseña debe tener entre 10 y 128 caracteres.',
          admin_account_not_found: 'No existe una cuenta con el ADMIN_EMAIL configurado.'
        };
        msg.textContent = labels[body.error] || 'No se pudo recuperar la cuenta.';
        return;
      }

      msg.textContent = 'Contraseña actualizada. Entrando en administración...';
      setTimeout(() => {
        window.location.href = '/admin';
      }, 500);
    } catch (_) {
      msg.textContent = 'No se pudo conectar con el servidor.';
    }
  });
}
