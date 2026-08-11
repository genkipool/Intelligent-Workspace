document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const previewId = urlParams.get('id');

    if (!previewId) {
        document.getElementById('loading').innerText = 'No se especificó ningún ID de recorte.';
        return;
    }

    const key = `preview_${previewId}`;
    const result = await chrome.storage.session.get(key);
    const data = result[key];

    if (!data) {
        document.getElementById('loading').innerText = 'No se encontró el contenido en la memoria temporal.';
        return;
    }

    const mainContent = document.getElementById('mainContent');
    const headerTitle = document.getElementById('headerTitle');
    const copyBtn = document.getElementById('copyBtn');

    if (data.type === 'selection') {
        headerTitle.innerText = '📝 Selección de Texto';
        mainContent.innerText = data.text;

        copyBtn.onclick = () => {
            navigator.clipboard.writeText(data.text);
            copyBtn.innerText = '¡Copiado!';
            setTimeout(() => (copyBtn.innerText = 'Copiar'), 2000);
        };
    } else if (data.type === 'image') {
        headerTitle.innerText = '🖼️ Visor de Imagen';
        mainContent.innerHTML = '';
        mainContent.className = 'image-container';

        const img = document.createElement('img');
        img.src = data.srcUrl;
        mainContent.appendChild(img);

        copyBtn.innerText = 'Copiar URL';
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(data.srcUrl);
            copyBtn.innerText = '¡URL Copiada!';
            setTimeout(() => (copyBtn.innerText = 'Copiar URL'), 2000);
        };
    }
});
