// Exact-source backlink pattern for offline technical HTML.
// Attach after the document body exists. Adapt selectors/classes as needed.
(() => {
  const root = document.querySelector('main');
  if (!root) return;

  const usedIds = new Set([...document.querySelectorAll('[id]')].map(node => node.id));
  let sourceCounter = 1;

  function ensureSourceId(source) {
    if (source.id) return source.id;
    while (usedIds.has(`xref-source-${sourceCounter}`)) sourceCounter += 1;
    source.id = `xref-source-${sourceCounter++}`;
    usedIds.add(source.id);
    return source.id;
  }

  function installReturnLink(source, target) {
    const sourceId = ensureSourceId(source);
    let backlink = target._exactSourceBacklink;

    if (!backlink) {
      backlink = document.createElement('a');
      backlink.className = 'xref-return';
      backlink.textContent = '↩ 이전 위치';
      backlink.setAttribute('aria-label', '본문의 이전 위치로 돌아가기');

      // A direct anchor child is invalid inside <table>; put it in the caption.
      const host = target.tagName === 'TABLE'
        ? (target.querySelector('caption') || target.parentElement)
        : target;
      host.prepend(backlink);
      target._exactSourceBacklink = backlink;
    }

    // Update on every click: repeated citations return to the latest source.
    backlink.href = `#${sourceId}`;
  }

  root.addEventListener('click', event => {
    const source = event.target.closest('a[href^="#"]');
    if (!source || source.classList.contains('xref-return')) return;

    const targetId = decodeURIComponent(source.getAttribute('href').slice(1));
    const target = document.getElementById(targetId);
    if (target) installReturnLink(source, target);
  });
})();
