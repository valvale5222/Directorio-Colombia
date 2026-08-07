// Portada — carga de imagen personalizada del cover.
// El fondo por defecto se fija en el propio HTML (assets/img/cover-cartama.jpg),
// así que ya no hace falta el fallback JS que lo inyectaba por primera vez.

const imgInput = document.getElementById('imgInput');
if (imgInput) {
  imgInput.onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = (ev) => { document.getElementById('coverImg').style.backgroundImage = 'url(' + ev.target.result + ')'; };
    rd.readAsDataURL(f);
  };
}
