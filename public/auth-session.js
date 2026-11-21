// Shared logout flow: API/CSRF stays in each page's existing api() helper.
export async function logoutSession({ button, api, onSignedOut, notify }) {
  button.disabled = true;
  try {
    await api('/api/auth/logout', { method: 'POST', body: {} });
    localStorage.removeItem('jielien-cart-v2');
    localStorage.removeItem('jielien-cart-owner');
    onSignedOut();
    notify('Đã đăng xuất.');
  } catch (error) {
    notify(error.message);
    button.disabled = false;
  }
}
