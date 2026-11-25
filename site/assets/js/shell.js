const shell = document.querySelector('.shell');
const toggle = document.querySelector('.menu-toggle');
const narrow = matchMedia('(max-width: 700px)');
function setCollapsed(value) {
  shell.classList.toggle('nav-collapsed', value);
  toggle.setAttribute('aria-expanded', String(!value));
}
setCollapsed(narrow.matches);
toggle.addEventListener('click', () => setCollapsed(!shell.classList.contains('nav-collapsed')));
narrow.addEventListener('change', event => setCollapsed(event.matches));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && narrow.matches && !shell.classList.contains('nav-collapsed')) {
    setCollapsed(true);
    toggle.focus();
  }
});
