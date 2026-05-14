export function generateId() {
    return 'id_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now();
}

export function escapeHtml(str) {
    return String(str)
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;')
        .replace(/'/g,  '&#39;');
}
