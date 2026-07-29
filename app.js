// ===================== BASE DE DATOS =====================
const DB_NAME = 'SuperStockDB';
const DB_VERSION = 3;
let db;

const CATEGORIES = ['Alimentos', 'Bebidas', 'Limpieza', 'Higiene', 'Mascotas', 'Otros'];

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => { db = req.result; resolve(db); };
        req.onupgradeneeded = (e) => {
            const d = e.target.result;
            if (!d.objectStoreNames.contains('products')) {
                d.createObjectStore('products', { keyPath: 'id', autoIncrement: true });
            }
            if (!d.objectStoreNames.contains('history')) {
                d.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
            }
        };
    });
}

function getStore(store, mode = 'readonly') {
    return db.transaction(store, mode).objectStore(store);
}

function getAll(store) {
    return new Promise((resolve, reject) => {
        const req = getStore(store).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function addItem(store, item) {
    return new Promise((resolve, reject) => {
        const req = getStore(store, 'readwrite').add(item);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function putItem(store, item) {
    return new Promise((resolve, reject) => {
        const req = getStore(store, 'readwrite').put(item);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function deleteItem(store, id) {
    return new Promise((resolve, reject) => {
        const req = getStore(store, 'readwrite').delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

// ===================== ESTADO =====================
let products = [];
let history = [];
let selectedCategory = 'Todas';
let editingId = null;
let menuProductId = null;

// ===================== INICIO =====================
document.addEventListener('DOMContentLoaded', async () => {
    await openDB();
    await loadData();
    renderFilters();
    renderStock();
    renderLista();
    renderHistorial();
    updateBadge();

    if (products.length === 0) {
        await seedDemoData();
    }
});

async function loadData() {
    products = await getAll('products');
    history = await getAll('history');
}

async function seedDemoData() {
    const demo = [
        { name: 'Leche', qty: 1, unit: 'L', min: 2, cat: 'Bebidas', price: 1200, updated: Date.now() },
        { name: 'Huevos', qty: 3, unit: 'unidades', min: 6, cat: 'Alimentos', price: 150, updated: Date.now() },
        { name: 'Arroz', qty: 0.5, unit: 'kg', min: 1, cat: 'Alimentos', price: null, updated: Date.now() },
        { name: 'Papel higiénico', qty: 2, unit: 'rollos', min: 4, cat: 'Higiene', price: 800, updated: Date.now() },
        { name: 'Detergente', qty: 0, unit: 'L', min: 1, cat: 'Limpieza', price: 2500, updated: Date.now() },
        { name: 'Yogur', qty: 4, unit: 'unidades', min: 4, cat: 'Alimentos', price: 600, updated: Date.now() },
        { name: 'Coca Cola', qty: 1, unit: 'L', min: 2, cat: 'Bebidas', price: 1800, updated: Date.now() },
        { name: 'Jabón de baño', qty: 1, unit: 'unidades', min: 2, cat: 'Higiene', price: null, updated: Date.now() },
    ];
    for (const p of demo) {
        await addItem('products', p);
    }
    products = await getAll('products');
    renderStock();
    renderLista();
    updateBadge();
    showToast('Datos de ejemplo cargados');
}

// ===================== ESCALA DE ESTADOS =====================
// 0 = rojo | 1 a 6 = amarillo | 6 o mas = verde
function getStatus(p) {
    const q = Number(p.qty);
    if (q <= 0) return 'out';
    if (q < 6) return 'low';
    return 'ok';
}

function getStatusLabel(p) {
    const s = getStatus(p);
    if (s === 'out') return 'Agotado';
    if (s === 'low') return 'Bajo';
    return 'OK';
}

function getStatusText(p) {
    return fmtNum(p.qty) + ' ' + p.unit;
}

function fmtNum(n) {
    return Number(n).toFixed(2).replace(/\.00$/, '').replace(/\.0$/, '');
}

function fmtPrice(n) {
    if (n === null || n === undefined || n === '') return '';
    return '$' + Number(n).toLocaleString('es-AR');
}

// ===================== RENDER STOCK =====================
function renderFilters() {
    const container = document.getElementById('stock-filters');
    let html = `<button class="cat-chip ${selectedCategory === 'Todas' ? 'active' : ''}" onclick="setCategory('Todas')">Todas</button>`;
    for (const cat of CATEGORIES) {
        const count = products.filter(p => p.cat === cat).length;
        html += `<button class="cat-chip ${selectedCategory === cat ? 'active' : ''}" onclick="setCategory('${cat}')">${cat} ${count > 0 ? '(' + count + ')' : ''}</button>`;
    }
    container.innerHTML = html;
}

function setCategory(cat) {
    selectedCategory = cat;
    renderFilters();
    renderStock();
}

function renderStock() {
    const search = document.getElementById('stock-search').value.toLowerCase();
    const list = document.getElementById('stock-list');

    let filtered = products.filter(p => {
        if (selectedCategory !== 'Todas' && p.cat !== selectedCategory) return false;
        if (search && !p.name.toLowerCase().includes(search)) return false;
        return true;
    });

    filtered.sort((a, b) => {
        const sa = getStatus(a);
        const sb = getStatus(b);
        const order = { out: 0, low: 1, ok: 2 };
        if (order[sa] !== order[sb]) return order[sa] - order[sb];
        return a.name.localeCompare(b.name);
    });

    document.getElementById('stat-ok').textContent = products.filter(p => getStatus(p) === 'ok').length;
    document.getElementById('stat-low').textContent = products.filter(p => getStatus(p) === 'low').length;
    document.getElementById('stat-out').textContent = products.filter(p => getStatus(p) === 'out').length;

    if (filtered.length === 0) {
        list.innerHTML = `<div class="empty-state"><h3>No hay productos</h3><p>Agregá tu primer producto con el botón +</p></div>`;
        return;
    }

    let html = '';
    for (const p of filtered) {
        const status = getStatus(p);
        const statusClass = 'status-' + status;
        const priceHtml = p.price ? `<div class="product-price">${fmtPrice(p.price)} / ${p.unit}</div>` : '';
        html += `
            <div class="product-item">
                <div class="product-status ${statusClass}"></div>
                <div class="product-info" onclick="editProduct(${p.id})">
                    <div class="product-name">${escapeHtml(p.name)}</div>
                    <div class="product-meta">${p.cat} · ${getStatusText(p)} · min: ${fmtNum(p.min)} ${p.unit} · ${getStatusLabel(p)}</div>
                    ${priceHtml}
                </div>
                <div class="product-actions">
                    <button class="btn-icon" onclick="consumeOne(${p.id}, event)" title="Consumí uno">−</button>
                    <button class="btn-icon primary" onclick="addOne(${p.id}, event)" title="Agregué uno">+</button>
                </div>
            </div>`;
    }
    list.innerHTML = html;
}

// ===================== RENDER LISTA =====================
function renderLista() {
    const container = document.getElementById('lista-content');
    const totalBox = document.getElementById('lista-total-box');
    const lista = products.filter(p => getStatus(p) !== 'ok');
    lista.sort((a, b) => {
        const sa = getStatus(a) === 'out' ? 0 : 1;
        const sb = getStatus(b) === 'out' ? 0 : 1;
        if (sa !== sb) return sa - sb;
        return a.name.localeCompare(b.name);
    });

    let total = 0;
    let itemsConPrecio = 0;
    for (const p of lista) {
        if (p.price) {
            const faltan = Math.max(0, p.min - p.qty);
            total += faltan * p.price;
            itemsConPrecio++;
        }
    }

    if (lista.length === 0) {
        totalBox.style.display = 'none';
        container.innerHTML = `<div class="empty-state"><h3>Todo en orden</h3><p>No necesitás comprar nada por ahora.</p></div>`;
        return;
    }

    totalBox.style.display = 'block';
    const totalText = itemsConPrecio > 0 ? fmtPrice(total) : 'Sin datos';
    const hintText = itemsConPrecio > 0 && itemsConPrecio < lista.length ? ' (faltan precios)' : '';
    document.getElementById('lista-total').textContent = totalText + hintText;

    let html = '<div class="swipe-hint">Tocá un producto para opciones · Marcá la casilla al comprar</div>';
    for (const p of lista) {
        const status = getStatus(p);
        const statusClass = 'status-' + status;
        const isChecked = p.qty >= p.min;
        const priceText = p.price ? ` · ${fmtPrice(p.price)}` : '';
        html += `
            <div class="product-item" style="position:relative;">
                <div class="checkbox-wrap ${isChecked ? 'checked' : ''}" onclick="toggleComprado(${p.id})">
                    ${isChecked ? '✓' : ''}
                </div>
                <div class="product-info" onclick="openMenu(${p.id})">
                    <div class="product-name">${escapeHtml(p.name)}</div>
                    <div class="product-meta">${p.cat} · Faltan: ${fmtNum(Math.max(0, p.min - p.qty))} ${p.unit}${priceText}</div>
                </div>
                <div class="product-status ${statusClass}"></div>
            </div>`;
    }
    container.innerHTML = html;
}

// ===================== RENDER HISTORIAL =====================
function renderHistorial() {
    const container = document.getElementById('historial-content');
    const sorted = [...history].sort((a, b) => b.date - a.date);

    if (sorted.length === 0) {
        container.innerHTML = `<div class="empty-state"><h3>Sin historial</h3><p>Las compras que marques aparecerán acá.</p></div>`;
        return;
    }

    let html = '';
    for (const h of sorted.slice(0, 50)) {
        const d = new Date(h.date);
        const fecha = d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
        const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        const priceText = h.price ? ` · ${fmtPrice(h.price * h.qty)}` : '';
        html += `
            <div class="history-item">
                <div>
                    <div style="font-weight:600">${escapeHtml(h.name)}</div>
                    <div class="history-date">${fecha} · ${hora}</div>
                </div>
                <div style="color:var(--text);font-weight:600">+${fmtNum(h.qty)} ${h.unit}${priceText}</div>
            </div>`;
    }
    container.innerHTML = html;
}

function updateBadge() {
    const count = products.filter(p => getStatus(p) !== 'ok').length;
    const badge = document.getElementById('lista-badge');
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline-block' : 'none';
}

// ===================== ACCIONES RÁPIDAS =====================
async function consumeOne(id, event) {
    if (event) event.stopPropagation();
    const p = products.find(x => x.id === id);
    if (!p || p.qty <= 0) return;
    p.qty = Math.max(0, p.qty - 1);
    p.updated = Date.now();
    await putItem('products', p);
    await loadData();
    renderStock();
    renderLista();
    updateBadge();
    showToast(`${p.name}: ${fmtNum(p.qty)} ${p.unit}`);
}

async function addOne(id, event) {
    if (event) event.stopPropagation();
    const p = products.find(x => x.id === id);
    if (!p) return;
    p.qty = p.qty + 1;
    p.updated = Date.now();
    await putItem('products', p);
    await loadData();
    renderStock();
    renderLista();
    updateBadge();
    showToast(`${p.name}: ${fmtNum(p.qty)} ${p.unit}`);
}

async function toggleComprado(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;

    if (p.qty >= p.min) {
        p.qty = 0;
    } else {
        const comprado = Math.max(1, p.min - p.qty);
        p.qty = p.qty + comprado;
        await addItem('history', {
            name: p.name,
            qty: comprado,
            unit: p.unit,
            price: p.price || null,
            date: Date.now()
        });
    }
    p.updated = Date.now();
    await putItem('products', p);
    await loadData();
    renderStock();
    renderLista();
    renderHistorial();
    updateBadge();
}

// ===================== MENÚ CONTEXTUAL (LISTA) =====================
function openMenu(id) {
    menuProductId = id;
    document.getElementById('menu-overlay').classList.add('active');
}

function closeMenu() {
    document.getElementById('menu-overlay').classList.remove('active');
    menuProductId = null;
}

function menuEdit() {
    if (menuProductId) {
        closeMenu();
        editProduct(menuProductId);
    }
}

async function menuReset() {
    if (!menuProductId) return;
    const p = products.find(x => x.id === menuProductId);
    if (!p) return;
    p.qty = 0;
    p.updated = Date.now();
    await putItem('products', p);
    closeMenu();
    await loadData();
    renderStock();
    renderLista();
    updateBadge();
    showToast(`${p.name} restablecido a 0`);
}

async function menuDelete() {
    if (!menuProductId) return;
    const p = products.find(x => x.id === menuProductId);
    if (!p) return;
    if (!confirm(`¿Eliminar "${p.name}"?`)) { closeMenu(); return; }
    await deleteItem('products', menuProductId);
    closeMenu();
    await loadData();
    renderStock();
    renderLista();
    renderFilters();
    updateBadge();
    showToast('Producto eliminado');
}

// ===================== MODAL PRODUCTO =====================
function openModal(id = null) {
    editingId = id;
    const modal = document.getElementById('modal');
    const title = document.getElementById('modal-title');
    const btnSave = document.getElementById('btn-save');
    const btnDelete = document.getElementById('btn-delete');
    const btnReset = document.getElementById('btn-reset');

    document.getElementById('product-form').reset();
    document.getElementById('edit-id').value = '';

    if (id) {
        const p = products.find(x => x.id === id);
        if (!p) return;
        title.textContent = 'Editar producto';
        btnSave.textContent = 'Guardar cambios';
        btnDelete.style.display = 'block';
        btnReset.style.display = 'block';
        document.getElementById('edit-id').value = p.id;
        document.getElementById('prod-name').value = p.name;
        document.getElementById('prod-qty').value = p.qty;
        document.getElementById('prod-unit').value = p.unit;
        document.getElementById('prod-min').value = p.min;
        document.getElementById('prod-cat').value = p.cat;
        document.getElementById('prod-price').value = p.price || '';
    } else {
        title.textContent = 'Nuevo producto';
        btnSave.textContent = 'Guardar';
        btnDelete.style.display = 'none';
        btnReset.style.display = 'none';
    }

    modal.classList.add('active');
    setTimeout(() => document.getElementById('prod-name').focus(), 100);
}

function closeModal() {
    document.getElementById('modal').classList.remove('active');
    editingId = null;
}

function closeModalOutside(e) {
    if (e.target === document.getElementById('modal')) closeModal();
}

async function saveProduct(e) {
    e.preventDefault();
    const name = document.getElementById('prod-name').value.trim();
    const qty = parseFloat(document.getElementById('prod-qty').value);
    const unit = document.getElementById('prod-unit').value;
    const min = parseFloat(document.getElementById('prod-min').value);
    const cat = document.getElementById('prod-cat').value;
    const priceVal = document.getElementById('prod-price').value;
    const price = priceVal ? parseFloat(priceVal) : null;

    if (!name || isNaN(qty) || isNaN(min)) return;

    const item = { name, qty, unit, min, cat, price, updated: Date.now() };

    if (editingId) {
        item.id = editingId;
        await putItem('products', item);
        showToast('Producto actualizado');
    } else {
        await addItem('products', item);
        showToast('Producto agregado');
    }

    closeModal();
    await loadData();
    renderStock();
    renderLista();
    renderFilters();
    updateBadge();
}

async function resetQty() {
    if (!editingId) return;
    const p = products.find(x => x.id === editingId);
    if (!p) return;
    if (!confirm(`¿Restablecer "${p.name}" a 0?`)) return;
    p.qty = 0;
    p.updated = Date.now();
    await putItem('products', p);
    closeModal();
    await loadData();
    renderStock();
    renderLista();
    updateBadge();
    showToast(`${p.name} restablecido a 0`);
}

async function deleteProduct() {
    if (!editingId) return;
    const p = products.find(x => x.id === editingId);
    if (!p) return;
    if (!confirm(`¿Eliminar "${p.name}"?`)) return;
    await deleteItem('products', editingId);
    closeModal();
    await loadData();
    renderStock();
    renderLista();
    renderFilters();
    updateBadge();
    showToast('Producto eliminado');
}

function editProduct(id) {
    openModal(id);
}

// ===================== NAVEGACIÓN =====================
function showSection(name) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('section-' + name).classList.add('active');
    event.target.closest('.nav-tab').classList.add('active');

    if (name === 'stock') renderStock();
    if (name === 'lista') renderLista();
    if (name === 'historial') renderHistorial();
}

// ===================== UTILS =====================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2200);
}

// ===================== SERVICE WORKER =====================
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
}
