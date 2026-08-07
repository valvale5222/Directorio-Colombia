// Carga perezosa y cacheada de los datasets normalizados en /data.
// Varias vistas comparten el mismo dataset (Ventas y Clientes leen ambas
// "data/ventas.json"), así que cada archivo solo se pide una vez por sesión.

const cache = new Map();

function load(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch(path).then(r => r.json()));
  }
  return cache.get(path);
}

export const getVentas = () => load('data/ventas.json');
export const getPipeline = () => load('data/pipeline.json');
export const getObjetivos = () => load('data/objetivos.json');
export const getParticipacion = () => load('data/participacion.json');
export const getOrganigrama = () => load('data/organigrama.json');
