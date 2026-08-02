// Drzewiasta checklista OUG/WUG — dowolna głębokość, checkbox
// wykonano/nie-wykonano, dodawanie/edycja/usuwanie węzłów na każdym
// poziomie. Każdy węzeł najwyższego poziomu to osobny rekord w magazynie
// 'przegladyOugWug' (np. "1. Kontrola kombajnu"); dzieci ("1a. kontrola
// czujników...", "1aa. DAK organ"...) są zagnieżdżone wewnątrz tego samego
// rekordu jako tablica — prościej niż relacje 1:N w IndexedDB, wystarczające
// dla dowolnie głębokiego, ale pojedynczego drzewa na punkt główny.

import { nadzorGetAll, nadzorAdd, nadzorUpdate, nadzorDelete } from './db.js';

const STORE = 'przegladyOugWug';

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function emptyNode(label = 'Nowy punkt') {
  return { label, checked: false, children: [] };
}

function findNode(root, path) {
  let node = root;
  for (const idx of path) node = node.children[idx];
  return node;
}

function findParentAndIndex(root, path) {
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];
  return { parent: findNode(root, parentPath), index };
}

function createOugWugModule({ listId, addRootBtnId }) {
  const listEl = document.getElementById(listId);
  const addRootBtn = document.getElementById(addRootBtnId);

  let roots = []; // pełne rekordy z IndexedDB (id + label + checked + children)

  function renderNode(node, rootId, path) {
    const pathAttr = path.join('.');
    const childrenHtml = (node.children || [])
      .map((child, i) => renderNode(child, rootId, [...path, i]))
      .join('');

    return `
      <li class="oug-node">
        <div class="oug-node-row">
          <input type="checkbox" class="oug-check" data-root="${rootId}" data-path="${pathAttr}" ${node.checked ? 'checked' : ''}>
          <input type="text" class="oug-label" data-root="${rootId}" data-path="${pathAttr}" value="${escapeHtml(node.label)}">
          <button type="button" class="btn-small oug-add-child" data-root="${rootId}" data-path="${pathAttr}">+ Podpunkt</button>
          <button type="button" class="btn-small btn-danger oug-delete" data-root="${rootId}" data-path="${pathAttr}">Usuń</button>
        </div>
        ${childrenHtml ? `<ul class="oug-children">${childrenHtml}</ul>` : ''}
      </li>
    `;
  }

  function render() {
    if (roots.length === 0) {
      listEl.innerHTML = '<p class="empty-state">Brak punktów kontrolnych. Dodaj pierwszy punkt główny.</p>';
      return;
    }

    listEl.innerHTML = `<ul class="oug-tree">${roots
      .map((r) => renderNode(r, r.id, []))
      .join('')}</ul>`;

    attachHandlers();
  }

  async function saveRoot(rootId, mutateFn) {
    const root = roots.find((r) => r.id === rootId);
    mutateFn(root);
    await nadzorUpdate(STORE, root);
    render();
  }

  function attachHandlers() {
    listEl.querySelectorAll('.oug-check').forEach((el) => {
      el.addEventListener('change', () => {
        const rootId = Number(el.dataset.root);
        const path = el.dataset.path ? el.dataset.path.split('.').map(Number) : [];
        saveRoot(rootId, (root) => {
          const node = findNode(root, path);
          node.checked = el.checked;
        });
      });
    });

    listEl.querySelectorAll('.oug-label').forEach((el) => {
      el.addEventListener('change', () => {
        const rootId = Number(el.dataset.root);
        const path = el.dataset.path ? el.dataset.path.split('.').map(Number) : [];
        saveRoot(rootId, (root) => {
          const node = findNode(root, path);
          node.label = el.value;
        });
      });
    });

    listEl.querySelectorAll('.oug-add-child').forEach((el) => {
      el.addEventListener('click', () => {
        const rootId = Number(el.dataset.root);
        const path = el.dataset.path ? el.dataset.path.split('.').map(Number) : [];
        saveRoot(rootId, (root) => {
          const node = findNode(root, path);
          node.children = node.children || [];
          node.children.push(emptyNode());
        });
      });
    });

    listEl.querySelectorAll('.oug-delete').forEach((el) => {
      el.addEventListener('click', async () => {
        if (!confirm('Usunąć ten punkt (i wszystkie podpunkty)?')) return;
        const rootId = Number(el.dataset.root);
        const path = el.dataset.path ? el.dataset.path.split('.').map(Number) : [];

        if (path.length === 0) {
          await nadzorDelete(STORE, rootId);
          roots = roots.filter((r) => r.id !== rootId);
          render();
          return;
        }

        await saveRoot(rootId, (root) => {
          const { parent, index } = findParentAndIndex(root, path);
          parent.children.splice(index, 1);
        });
      });
    });
  }

  async function refresh() {
    roots = await nadzorGetAll(STORE);
    render();
  }

  addRootBtn.addEventListener('click', async () => {
    const label = prompt('Nazwa punktu głównego (np. "1. Kontrola kombajnu"):');
    if (!label) return;
    await nadzorAdd(STORE, emptyNode(label));
    await refresh();
  });

  return { init: refresh };
}

const ougWugModule = createOugWugModule({
  listId: 'ougwug-list-container',
  addRootBtnId: 'ougwug-add-root-btn',
});

export const initOugWug = ougWugModule.init;
// init() już robi pełny refetch+render — alias pod wywołania odświeżające
// przy każdym wejściu na tę pod-zakładkę (patrz app.js).
export const refreshOugWug = ougWugModule.init;
