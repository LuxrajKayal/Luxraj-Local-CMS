(() => {
  const shell = document.getElementById('luxraj-cms-shell');
  const toggle = shell.querySelector('.lc-menu-toggle');
  const narrow = matchMedia('(max-width: 700px)');
  function setCollapsed(value) {
    shell.classList.toggle('lc-nav-collapsed', value);
    toggle.setAttribute('aria-expanded', String(!value));
  }
  setCollapsed(narrow.matches);
  toggle.addEventListener('click', () => setCollapsed(!shell.classList.contains('lc-nav-collapsed')));
  narrow.addEventListener('change', event => setCollapsed(event.matches));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && narrow.matches && !shell.classList.contains('lc-nav-collapsed')) {
      setCollapsed(true);
      toggle.focus();
    }
  });
})();
