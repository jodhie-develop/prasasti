// Floating chat assistant backed by /api/chat (see api/chat.js).
(function () {
  const root = document.createElement('div');
  root.className = 'chatw';
  root.innerHTML = `
    <div class="chatw-panel" id="chatwPanel" role="dialog" aria-label="Prasasti Smart Assistant" hidden>
      <div class="chatw-head">
        <div>
          <strong>Prasasti Smart Assistant</strong>
          <span>Tanya seputar layanan, kepabeanan, dan pengiriman</span>
        </div>
        <button type="button" class="chatw-close" aria-label="Tutup chat">&times;</button>
      </div>
      <div class="chatw-msgs" aria-live="polite"></div>
      <div class="chatw-quick">
        <button type="button">Layanan apa saja yang tersedia?</button>
        <button type="button">Dokumen apa saja untuk impor?</button>
        <button type="button">Alamat kantor Prasasti</button>
      </div>
      <form class="chatw-form">
        <input type="text" placeholder="Tulis pertanyaan Anda..." aria-label="Pesan" maxlength="1000" autocomplete="off">
        <button type="submit" aria-label="Kirim">&#10148;</button>
      </form>
    </div>
    <button type="button" class="chatw-toggle" aria-controls="chatwPanel" aria-expanded="false" aria-label="Buka chat">
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>
    </button>`;
  document.body.appendChild(root);

  const panel = root.querySelector('.chatw-panel');
  const toggle = root.querySelector('.chatw-toggle');
  const msgs = root.querySelector('.chatw-msgs');
  const form = root.querySelector('.chatw-form');
  const input = form.querySelector('input');
  const quick = root.querySelector('.chatw-quick');
  let history = [];
  let busy = false;

  // Escape first, then allow **bold** and line breaks from the model's markdown.
  function format(text) {
    const esc = text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    return esc.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
  }

  function bubble(role, text) {
    const el = document.createElement('div');
    el.className = 'chatw-msg ' + role;
    if (role === 'bot') el.innerHTML = format(text); else el.textContent = text;
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
    return el;
  }

  function setOpen(open) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.classList.toggle('open', open);
    if (open) {
      if (!msgs.children.length) bubble('bot', 'Halo! Saya asisten virtual **PT Prasasti Adyadma Sentosa**. Ada yang bisa saya bantu terkait pengiriman Anda?');
      input.focus();
    }
  }

  async function send(text) {
    text = text.trim();
    if (!text || busy) return;
    busy = true;
    quick.hidden = true;
    bubble('user', text);
    input.value = '';
    const loading = bubble('bot loading', 'Sedang mengetik...');
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history })
      });
      const data = await res.json();
      if (!data.reply) throw new Error(data.error || 'Gagal mendapatkan balasan.');
      loading.remove();
      bubble('bot', data.reply);
      history.push({ role: 'user', content: text }, { role: 'assistant', content: data.reply });
      history = history.slice(-20);
    } catch (err) {
      loading.remove();
      bubble('bot error', 'Maaf, terjadi gangguan koneksi. Silakan coba lagi atau hubungi info@prasastiindonesia.com.');
      console.error('[chat]', err);
    } finally {
      busy = false;
    }
  }

  toggle.addEventListener('click', () => setOpen(panel.hidden));
  root.querySelector('.chatw-close').addEventListener('click', () => setOpen(false));
  form.addEventListener('submit', e => { e.preventDefault(); send(input.value); });
  quick.addEventListener('click', e => { if (e.target.tagName === 'BUTTON') send(e.target.textContent); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) setOpen(false); });
})();
