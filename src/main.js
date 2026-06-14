import Chart from 'chart.js/auto';
import {
    initialVendors,
    initialPOs,
    dashboardMetrics,
    analyticsData,
} from './data.js';

const storageKey = 'sap-procurement-dashboard-state';
let state = { vendors: [], pos: [], selectedPO: null, invoiceHistory: [] };
let charts = {};

const views = document.querySelectorAll('.view');
const navButtons = document.querySelectorAll('[data-view]');
const actionButtons = document.querySelectorAll('[data-action]');
const sidebarItems = document.querySelectorAll('.sap-sidebar-item');

function init() {
    loadState();
    bindNavigation();
    bindActions();
    renderView('dashboard');
    document.addEventListener('keydown', handleKeyboardShortcuts);
}

function loadState() {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            state.vendors = parsed.vendors || initialVendors;
            state.pos = parsed.pos || initialPOs;
            state.selectedPO = null;
            state.invoiceHistory = parsed.invoiceHistory || [];
            return;
        } catch (error) {
            console.warn('Failed to parse saved state, resetting', error);
        }
    }
    state = {
        vendors: initialVendors,
        pos: initialPOs,
        selectedPO: null,
        invoiceHistory: [],
    };
    saveState();
}

function saveState() {
    const payload = {
        vendors: state.vendors,
        pos: state.pos,
        invoiceHistory: state.invoiceHistory,
    };
    localStorage.setItem(storageKey, JSON.stringify(payload));
}

function bindNavigation() {
    navButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const view = button.dataset.view;
            if (view) renderView(view);
        });
    });

    actionButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const action = button.dataset.action;
            if (action === 'export-po') exportPOs();
            if (action === 'refresh-data') refreshData();
        });
    });
}

function bindActions() {
    document.addEventListener('click', (event) => {
        const target = event.target.closest('[data-action]');
        if (!target) return;
        const action = target.dataset.action;
        if (action === 'view-po-detail') {
            renderPODetail(target.dataset.po);
        }
        if (action === 'verify-invoice') {
            const poNumber = target.dataset.po;
            markInvoiceVerified(poNumber);
        }
    });
}

function handleKeyboardShortcuts(event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (document.activeElement.closest('#view-po-create')) {
            savePurchaseOrder();
        }
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'g') {
        event.preventDefault();
        if (document.activeElement.closest('#view-gr')) {
            postGoodsReceipt();
        }
    }
}

function renderView(view) {
    if (view === 'invoice') {
        renderInvoiceView();
    }

    views.forEach((section) => {
        section.classList.toggle('active', section.id === `view-${view}`);
    });

    navButtons.forEach((button) =>
        button.classList.toggle('active', button.dataset.view === view),
    );
    sidebarItems.forEach((button) =>
        button.classList.toggle('active', button.dataset.view === view),
    );

    if (view === 'dashboard') renderDashboard();
    if (view === 'po-list') renderPOList();
    if (view === 'po-create') renderPOCreate();
    if (view === 'po-detail')
        renderPODetail(state.selectedPO || state.pos[0]?.poNumber);
    if (view === 'vendors') renderVendorMaster();
    if (view === 'analytics') renderAnalytics();
    if (view === 'gr') renderGoodsReceipt();
    if (view === 'invoice') renderInvoiceView();
}

function buildAlert(type, text) {
    const icon = type === 'warning' ? '⚠️' : 'ℹ️';
    return `<div class="alert-banner alert-${type}"><span>${icon}</span><span>${text}</span></div>`;
}

function createStatusBadge(status) {
    const normalized = status.toLowerCase();
    return `<span class="status-badge status-${normalized}">${status}</span>`;
}

function formatCurrency(value) {
    return new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
    }).format(value);
}

function createProgressBar(percent, color = '#1565c0') {
    return `<span class="progress-bar-wrap"><span class="progress-bar-fill" style="width:${percent}%;background:${color};"></span></span> ${percent === 100 ? 'Full' : percent === 0 ? 'None' : 'Part'}`;
}

function renderDashboard() {
    const table = state.pos.slice(0, 6);
    const section = document.getElementById('view-dashboard');
    section.innerHTML = `
    <div class="sap-breadcrumb">SAP S/4HANA / MM – Procurement / Dashboard</div>
    <div class="sap-page-header">
      <div class="sap-page-title">Procurement Overview · Plant 1000 · Org DE01</div>
      <div>
        <button class="btn-sap-outline" data-action="refresh-data">Reset Data</button>
        <button class="btn-sap">New Purchase Order</button>
      </div>
    </div>
    ${buildAlert('warning', '4 purchase orders pending approval — oldest is 3 days overdue · Review queue')}
    <div class="metric-row">
      <div class="metric-card"><div class="metric-label">Open POs</div><div class="metric-value">${dashboardMetrics.openPOs}</div><div class="metric-delta">+6 this week</div></div>
      <div class="metric-card"><div class="metric-label">Total Spend (MTD)</div><div class="metric-value">${formatCurrency(dashboardMetrics.totalSpend)}</div><div class="metric-delta">-8% vs last month</div></div>
      <div class="metric-card"><div class="metric-label">Pending Approval</div><div class="metric-value" style="color:#e65100;">${dashboardMetrics.pendingApproval}</div><div class="metric-delta">2 urgent · 2 standard</div></div>
      <div class="metric-card"><div class="metric-label">On-Time Delivery</div><div class="metric-value" style="color:#2e7d32;">${dashboardMetrics.onTimeDelivery}%</div><div class="metric-delta">+3% vs target</div></div>
    </div>
    <div class="chart-row">
      <div class="section-card"><div class="section-card-header"><div class="section-card-title">Monthly Spend by Category</div></div><div class="chart-wrap"><canvas id="spendChart"></canvas></div></div>
      <div class="section-card"><div class="section-card-header"><div class="section-card-title">PO Status Breakdown</div></div><div class="chart-wrap"><canvas id="statusChart"></canvas></div></div>
    </div>
    <div class="section-card"><div class="section-card-header"><div class="section-card-title">Recent Purchase Orders</div><button class="btn-sap-outline" data-view="po-list">View all</button></div>
      <table class="sap-table"><thead><tr><th>PO Number</th><th>Vendor</th><th>Material</th><th>Plant</th><th>Net Value</th><th>Delivery Date</th><th>Status</th><th>Buyer</th></tr></thead><tbody>
        ${table
            .map(
                (po) => `
          <tr data-action="view-po-detail" data-po="${po.poNumber}">
            <td style="color:#1565c0;cursor:pointer;">${po.poNumber}</td>
            <td>${po.vendorName}</td>
            <td>${po.materialGroup}</td>
            <td>${po.plant}</td>
            <td>${formatCurrency(po.netValue)}</td>
            <td>${po.deliveryDate}</td>
            <td>${createStatusBadge(po.status)}</td>
            <td>${po.buyer || 'N/A'}</td>
          </tr>
        `,
            )
            .join('')}
      </tbody></table>
    </div>
  `;

    chartRenderDashboard();
    section
        .querySelector('[data-view="po-list"]')
        .addEventListener('click', () => renderView('po-list'));
}

function renderPOList() {
    const section = document.getElementById('view-po-list');
    section.innerHTML = `
    <div class="sap-breadcrumb">SAP S/4HANA / MM / ME2M — Purchase Orders by Material</div>
    <div class="sap-page-header"><div class="sap-page-title">Purchase Order List — All Plants</div><button class="btn-sap" data-view="po-create">Create PO (ME21N)</button></div>
    <div class="section-card"><div class="filter-row">
      <input class="sap-input" id="filter-po-number" placeholder="PO Number" />
      <input class="sap-input" id="filter-vendor" placeholder="Vendor" />
      <select class="sap-select" id="filter-plant"><option value="">All Plants</option><option value="1000">1000 – Frankfurt</option><option value="2000">2000 – Munich</option><option value="3000">3000 – Hamburg</option></select>
      <select class="sap-select" id="filter-status"><option value="">All Statuses</option><option>Draft</option><option>Pending</option><option>Approved</option><option>Ordered</option><option>Received</option></select>
      <input class="sap-input" type="date" id="filter-start" />
      <input class="sap-input" type="date" id="filter-end" />
      <button class="btn-sap" id="apply-filters">Search</button>
    </div>
    <table class="sap-table"><thead><tr><th><input type="checkbox" id="select-all" /></th><th>PO Number</th><th>Doc Type</th><th>Vendor</th><th>Material Group</th><th>Plant</th><th>Currency</th><th>Net Value</th><th>Del. Date</th><th>GR Status</th><th>Status</th></tr></thead><tbody id="po-list-body"></tbody></table>
    <div class="section-card-header" style="border-top:none; justify-content: space-between;"><span id="po-list-summary"></span><div style="display:flex; gap:8px;"><button class="btn-sap-outline" id="prev-page">Prev</button><button class="btn-sap-outline" id="next-page">Next</button></div></div>
    </div>
  `;

    let currentPage = 1;
    const pageSize = 6;

    const filters = {
        number: '',
        vendor: '',
        plant: '',
        status: '',
        start: '',
        end: '',
    };

    const applyFilters = () => {
        const filtered = state.pos.filter((po) => {
            if (filters.number && !po.poNumber.includes(filters.number))
                return false;
            if (
                filters.vendor &&
                !po.vendorName
                    .toLowerCase()
                    .includes(filters.vendor.toLowerCase())
            )
                return false;
            if (filters.plant && po.plant !== filters.plant) return false;
            if (filters.status && po.status !== filters.status) return false;
            if (filters.start && po.deliveryDate < filters.start) return false;
            if (filters.end && po.deliveryDate > filters.end) return false;
            return true;
        });
        const startIndex = (currentPage - 1) * pageSize;
        const pageItems = filtered.slice(startIndex, startIndex + pageSize);
        document.getElementById('po-list-body').innerHTML = pageItems
            .map(
                (po) => `
      <tr data-action="view-po-detail" data-po="${po.poNumber}">
        <td><input type="checkbox" /></td>
        <td style="color:#1565c0;cursor:pointer;">${po.poNumber}</td>
        <td>${po.documentType}</td>
        <td>${po.vendorName} (${po.vendorId})</td>
        <td>${po.materialGroup}</td>
        <td>${po.plant}</td>
        <td>${po.currency}</td>
        <td>${po.netValue.toFixed(2)}</td>
        <td>${po.deliveryDate}</td>
        <td>${createProgressBar(po.grProgress, po.grProgress === 100 ? '#2e7d32' : '#1565c0')}</td>
        <td>${createStatusBadge(po.status)}</td>
      </tr>
    `,
            )
            .join('');
        document.getElementById('po-list-summary').textContent =
            `${Math.min(filtered.length, startIndex + 1)} - ${Math.min(filtered.length, startIndex + pageSize)} of ${filtered.length} records · Total: ${formatCurrency(filtered.reduce((sum, po) => sum + po.netValue, 0))}`;
    };

    document.getElementById('apply-filters').addEventListener('click', () => {
        filters.number = document
            .getElementById('filter-po-number')
            .value.trim();
        filters.vendor = document.getElementById('filter-vendor').value.trim();
        filters.plant = document.getElementById('filter-plant').value;
        filters.status = document.getElementById('filter-status').value;
        filters.start = document.getElementById('filter-start').value;
        filters.end = document.getElementById('filter-end').value;
        currentPage = 1;
        applyFilters();
    });

    document.getElementById('prev-page').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage -= 1;
            applyFilters();
        }
    });
    document.getElementById('next-page').addEventListener('click', () => {
        const filteredLength = state.pos.filter((po) => {
            if (filters.number && !po.poNumber.includes(filters.number))
                return false;
            if (
                filters.vendor &&
                !po.vendorName
                    .toLowerCase()
                    .includes(filters.vendor.toLowerCase())
            )
                return false;
            if (filters.plant && po.plant !== filters.plant) return false;
            if (filters.status && po.status !== filters.status) return false;
            if (filters.start && po.deliveryDate < filters.start) return false;
            if (filters.end && po.deliveryDate > filters.end) return false;
            return true;
        }).length;
        if (currentPage * pageSize < filteredLength) {
            currentPage += 1;
            applyFilters();
        }
    });

    applyFilters();

    section
        .querySelector('[data-view="po-create"]')
        .addEventListener('click', () => renderView('po-create'));
}

function renderPOCreate() {
    const section = document.getElementById('view-po-create');
    section.innerHTML = `
    <div class="sap-breadcrumb">SAP S/4HANA / MM / ME21N — Create Purchase Order</div>
    <div class="sap-page-header"><div class="sap-page-title">Create Purchase Order (ME21N)</div><div><button class="btn-sap-outline" data-view="po-list">Discard</button><button class="btn-sap" id="save-po">Save</button></div></div>
    ${buildAlert('info', 'Transaction ME21N — Standard PO · Document type NB · Company Code DE01')}
    <div class="section-card"><div class="section-card-header"><div class="section-card-title">Header Data</div></div><div class="header-grid">
      <div class="field-group"><label class="field-label">Document Type</label><select class="sap-select" id="po-document-type"><option value="NB" selected>NB – Standard PO</option><option value="FO">FO – Framework Order</option><option value="UB">UB – Stock Transfer Order</option></select></div>
      <div class="field-group"><label class="field-label">Vendor *</label><input class="sap-input" id="po-vendor" placeholder="Vendor no. or name" list="vendor-list" /></div>
      <datalist id="vendor-list">${state.vendors.map((vendor) => `<option value="${vendor.vendorId} — ${vendor.name}" />`).join('')}</datalist>
      <div class="field-group"><label class="field-label">Purchasing Org.</label><select class="sap-select" id="po-purchase-org"><option value="1000">1000 – Deutschland</option><option value="2000">2000 – Europa</option></select></div>
      <div class="field-group"><label class="field-label">Purchasing Group</label><select class="sap-select" id="po-purchase-group"><option value="001">001 – General Purchasing</option><option value="002">002 – Engineering</option><option value="003">003 – IT Procurement</option></select></div>
    </div></div>
    <div class="section-card"><div class="section-card-header"><div class="section-card-title">Line Items</div><button class="btn-sap-outline" id="add-po-line">Add Item</button></div><table class="sap-table" id="po-lines-table"><thead><tr><th>Item</th><th>Material</th><th>Short Text</th><th>Plant</th><th>Stor. Loc.</th><th>Qty</th><th>UoM</th><th>Net Price</th><th>Currency</th><th>Del. Date</th><th>Tax Code</th><th></th></tr></thead><tbody id="po-lines-body"></tbody></table><div class="order-summary" id="po-order-summary"></div></div>
  `;

    const linesBody = section.querySelector('#po-lines-body');
    const addLine = () => {
        const rowCount = linesBody.children.length + 1;
        const tr = document.createElement('tr');
        tr.innerHTML = `
      <td>${rowCount * 10}</td>
      <td><input class="sap-input" data-name="material" placeholder="Material no." /></td>
      <td><input class="sap-input" data-name="description" placeholder="Description" /></td>
      <td><select class="sap-select" data-name="plant"><option value="1000">1000</option><option value="2000">2000</option><option value="3000">3000</option></select></td>
      <td><input class="sap-input" data-name="storage" placeholder="0001" /></td>
      <td><input class="sap-input" type="number" data-name="qty" value="0" min="0" /></td>
      <td><select class="sap-select" data-name="uom"><option>EA</option><option>KG</option><option>L</option><option>M</option><option>PC</option></select></td>
      <td><input class="sap-input" type="number" data-name="price" value="0" min="0" step="0.01" /></td>
      <td><select class="sap-select" data-name="currency"><option>EUR</option><option>USD</option><option>GBP</option></select></td>
      <td><input class="sap-input" type="date" data-name="deliveryDate" /></td>
      <td><select class="sap-select" data-name="taxCode"><option>V1</option><option>A1</option></select></td>
      <td><button class="btn-sap-outline remove-line" type="button">Remove</button></td>
    `;
        linesBody.appendChild(tr);
        tr.querySelectorAll('input, select').forEach((input) =>
            input.addEventListener('input', updateOrderSummary),
        );
        tr.querySelector('.remove-line').addEventListener('click', () => {
            tr.remove();
            updateOrderSummary();
        });
        updateOrderSummary();
    };

    const updateOrderSummary = () => {
        const rows = Array.from(linesBody.querySelectorAll('tr'));
        const values = rows.map((row) => {
            const qty =
                parseFloat(row.querySelector('[data-name="qty"]').value) || 0;
            const price =
                parseFloat(row.querySelector('[data-name="price"]').value) || 0;
            return { qty, price };
        });
        const subtotal = values.reduce(
            (sum, item) => sum + item.qty * item.price,
            0,
        );
        const tax = subtotal * 0.19;
        const total = subtotal + tax;
        document.getElementById('po-order-summary').innerHTML = `
      <div class="field-group"><span class="field-label">Subtotal:</span><span>${formatCurrency(subtotal)}</span></div>
      <div class="field-group"><span class="field-label">Tax (19%):</span><span>${formatCurrency(tax)}</span></div>
      <div class="field-group"><span class="field-label">Total:</span><strong>${formatCurrency(total)}</strong></div>
    `;
    };

    section.querySelector('#add-po-line').addEventListener('click', addLine);
    addLine();

    section
        .querySelector('#save-po')
        .addEventListener('click', savePurchaseOrder);
    section
        .querySelector('[data-view="po-list"]')
        .addEventListener('click', () => renderView('po-list'));
}

function savePurchaseOrder() {
    const section = document.getElementById('view-po-create');
    const vendorInput = section.querySelector('#po-vendor');
    const vendorText = vendorInput.value.trim();
    if (!vendorText) {
        alert('Please enter a vendor.');
        vendorInput.focus();
        return;
    }

    const vendorMatch = state.vendors.find(
        (vendor) =>
            vendorText.includes(vendor.vendorId) ||
            vendorText.toLowerCase().includes(vendor.name.toLowerCase()),
    );
    const vendorId = vendorMatch ? vendorMatch.vendorId : '999999';
    const vendorName = vendorMatch ? vendorMatch.name : vendorText;

    const linesBody = section.querySelectorAll('#po-lines-body tr');
    const items = Array.from(linesBody)
        .map((row) => ({
            item: row.children[0].textContent,
            material: row.querySelector('[data-name="material"]').value.trim(),
            description: row
                .querySelector('[data-name="description"]')
                .value.trim(),
            plant: row.querySelector('[data-name="plant"]').value,
            storage: row.querySelector('[data-name="storage"]').value.trim(),
            qty: parseFloat(row.querySelector('[data-name="qty"]').value) || 0,
            uom: row.querySelector('[data-name="uom"]').value,
            netPrice:
                parseFloat(row.querySelector('[data-name="price"]').value) || 0,
            currency: row.querySelector('[data-name="currency"]').value,
            deliveryDate: row.querySelector('[data-name="deliveryDate"]').value,
            taxCode: row.querySelector('[data-name="taxCode"]').value,
        }))
        .filter(
            (item) =>
                item.material ||
                item.description ||
                item.qty > 0 ||
                item.netPrice > 0,
        );

    const netValue = items.reduce(
        (sum, item) => sum + item.qty * item.netPrice,
        0,
    );
    const newPO = {
        poNumber: generatePONumber(),
        documentType: document.getElementById('po-document-type').value,
        vendorId,
        vendorName,
        materialGroup: items[0]?.description || 'Mixed',
        plant: document.getElementById('po-purchase-org').value,
        currency: 'EUR',
        netValue,
        deliveryDate:
            items[0]?.deliveryDate || new Date().toISOString().slice(0, 10),
        status: 'Draft',
        grProgress: 0,
        grStatus: 'None',
        buyer: 'H. Missaoui',
        items,
        createdBy: 'H. Missaoui',
        createdOn: new Date().toISOString().slice(0, 10),
        changedOn: new Date().toISOString().slice(0, 10),
        paymentTerms: 'Z030',
        taxCode: 'V1',
        incoterms: 'DAP',
        companyCode: 'DE01',
        purchaseOrg: document.getElementById('po-purchase-org').value,
        purchaseGroup: document.getElementById('po-purchase-group').value,
        itemCategory: 'Standard',
        history: [],
    };

    state.pos.unshift(newPO);
    saveState();
    alert(`Purchase Order ${newPO.poNumber} saved as DRAFT.`);
    renderView('po-list');
}

function generatePONumber() {
    const last = state.pos[0]?.poNumber || '4500001239';
    const next = String(Number(last) + 1).padStart(last.length, '0');
    return next;
}

function renderPODetail(poNumber) {
    const po =
        state.pos.find((item) => item.poNumber === poNumber) || state.pos[0];
    if (!po) return;
    state.selectedPO = po.poNumber;
    saveState();
    const section = document.getElementById('view-po-detail');
    section.innerHTML = `
    <div class="sap-breadcrumb">SAP S/4HANA / MM / ME23N — Display Purchase Order</div>
    <div class="sap-page-header"><div class="sap-page-title">Purchase Order ${po.poNumber} — ${po.vendorName}</div><div><button class="btn-sap-outline" data-view="po-list">Back</button><button class="btn-sap-outline">Edit (ME22N)</button><button class="btn-sap">Print</button></div></div>
    <div class="alert-banner alert-info">Purchase order ${po.poNumber} status is ${po.status}. Document type ${po.documentType}.</div>
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:14px;"><span class="status-badge status-${po.status.toLowerCase()}">${po.status}</span><span style="color:var(--text-secondary)">Created by ${po.createdBy} · ${po.createdOn} · Changed: ${po.changedOn}</span></div>
    <div class="tab-bar"><button class="tab active" data-tab="tab-header">Header</button><button class="tab" data-tab="tab-items">Items</button><button class="tab" data-tab="tab-delivery">Delivery / Invoice</button><button class="tab" data-tab="tab-history">PO History</button></div>
    <div class="section-card"><div id="tab-header" class="tab-content active"><div class="po-detail-grid"><div>${buildDetailField('PO Number', po.poNumber)}${buildDetailField('Document Type', `${po.documentType} — ${po.documentType === 'NB' ? 'Standard Purchase Order' : po.documentType}`)}${buildDetailField('Vendor', `${po.vendorId} — ${po.vendorName}`)}${buildDetailField('Terms of Payment', po.paymentTerms)}</div><div>${buildDetailField('Purchasing Org.', po.purchaseOrg)}${buildDetailField('Purchasing Group', po.purchaseGroup)}${buildDetailField('Company Code', po.companyCode)}${buildDetailField('Currency / Exchange Rate', `${po.currency} / 1.00000`)}</div></div></div>
      <div id="tab-items" class="tab-content"><table class="sap-table"><thead><tr><th>Item</th><th>Material</th><th>Description</th><th>Plant</th><th>Qty</th><th>UoM</th><th>Net Price</th><th>Net Value</th><th>Delivery Date</th><th>GR Status</th></tr></thead><tbody>${po.items.map((item) => `<tr><td>${item.item}</td><td style="color:#1565c0;">${item.material}</td><td>${item.description}</td><td>${item.plant}</td><td>${item.qty}</td><td>${item.uom}</td><td>${formatCurrency(item.netPrice)}</td><td>${formatCurrency(item.netValue)}</td><td>${item.deliveryDate}</td><td><span class="status-badge status-received">${item.grStatus}</span></td></tr>`).join('')}</tbody></table><div class="field-group" style="display:flex;justify-content:flex-end;gap:24px;padding-top:16px;"><span>Net Value: <strong>${formatCurrency(po.netValue)}</strong></span><span>VAT (19%): <strong>${formatCurrency(po.netValue * 0.19)}</strong></span><span><strong>${formatCurrency(po.netValue * 1.19)}</strong></span></div></div>
      <div id="tab-delivery" class="tab-content"><div class="po-detail-grid"><div>${buildDetailField('Delivery Address', 'Plant 1000 · Gutleutstrasse 12, 60329 Frankfurt')}</div><div>${buildDetailField('Incoterms', po.incoterms)}${buildDetailField('GR-Based Invoice Verification', po.status === 'Received' ? '<span style="color:#2e7d32;">✔ Active</span>' : '<span style="color:#f57f17;">Pending</span>')}</div></div></div>
      <div id="tab-history" class="tab-content"><table class="sap-table"><thead><tr><th>Date</th><th>Time</th><th>User</th><th>Action</th><th>Document</th><th>Amount</th></tr></thead><tbody>${po.history.map((entry) => `<tr><td>${entry.date}</td><td>${entry.time}</td><td>${entry.user}</td><td>${entry.action}</td><td>${entry.document}</td><td>${entry.amount ? formatCurrency(entry.amount) : '—'}</td></tr>`).join('')}</tbody></table></div></div>
    </div>
  `;

    section.querySelectorAll('.tab').forEach((tab) => {
        tab.addEventListener('click', () => switchDetailTab(tab.dataset.tab));
    });

    section
        .querySelector('[data-view="po-list"]')
        .addEventListener('click', () => renderView('po-list'));
}

function buildDetailField(label, value) {
    return `<div class="field-group"><div class="field-label">${label}</div><div class="field-value">${value}</div></div>`;
}

function switchDetailTab(tabId) {
    const section = document.getElementById('view-po-detail');
    section
        .querySelectorAll('.tab')
        .forEach((tab) =>
            tab.classList.toggle('active', tab.dataset.tab === tabId),
        );
    section
        .querySelectorAll('.tab-content')
        .forEach((content) =>
            content.classList.toggle('active', content.id === tabId),
        );
}

function renderVendorMaster() {
    const section = document.getElementById('view-vendors');
    section.innerHTML = `
    <div class="sap-breadcrumb">SAP S/4HANA / MM / MK03 — Vendor Master</div>
    <div class="sap-page-header"><div class="sap-page-title">Vendor Master Data</div><button class="btn-sap">Create Vendor (MK01)</button></div>
    <div class="section-card"><div class="filter-row"><input class="sap-input" id="vendor-search" placeholder="Vendor number or name" /><select class="sap-select" id="vendor-country"><option value="">All Countries</option><option>Germany</option><option>France</option><option>USA</option></select><select class="sap-select" id="vendor-group"><option value="">All Groups</option><option>Industrial</option><option>Chemical</option><option>IT</option><option>Safety</option></select><button class="btn-sap" id="vendor-search-btn">Search</button></div>
      <table class="sap-table"><thead><tr><th>Vendor No.</th><th>Name</th><th>Country</th><th>City</th><th>Account Group</th><th>Payment Terms</th><th>YTD Spend</th><th>On-Time %</th><th>Rating</th><th>Status</th></tr></thead><tbody id="vendor-list-body"></tbody></table></div>
  `;

    const renderList = () => {
        const searchText = section
            .querySelector('#vendor-search')
            .value.trim()
            .toLowerCase();
        const country = section.querySelector('#vendor-country').value;
        const group = section.querySelector('#vendor-group').value;
        const filtered = state.vendors.filter((vendor) => {
            if (
                searchText &&
                !`${vendor.vendorId} ${vendor.name}`
                    .toLowerCase()
                    .includes(searchText)
            )
                return false;
            if (country && vendor.country !== country) return false;
            if (
                group &&
                !vendor.accountGroup.toLowerCase().includes(group.toLowerCase())
            )
                return false;
            return true;
        });
        section.querySelector('#vendor-list-body').innerHTML = filtered
            .map(
                (vendor) => `
      <tr><td>${vendor.vendorId}</td><td>${vendor.name}</td><td>${vendor.country}</td><td>${vendor.city}</td><td>${vendor.accountGroup}</td><td>${vendor.paymentTerms}</td><td>${formatCurrency(vendor.ytdSpend)}</td><td>${vendor.onTime}%</td><td><span class="status-badge ${vendor.rating === 'A+' ? 'status-approved' : vendor.rating === 'B' ? 'status-pending' : 'status-pending'}">${vendor.rating}</span></td><td><span class="status-badge status-approved">Active</span></td></tr>
    `,
            )
            .join('');
    };

    section
        .querySelector('#vendor-search-btn')
        .addEventListener('click', renderList);
    renderList();
}

function renderAnalytics() {
    const section = document.getElementById('view-analytics');
    section.innerHTML = `
    <div class="sap-breadcrumb">SAP S/4HANA / MM / ME2A — Spend Analytics</div>
    <div class="sap-page-header"><div class="sap-page-title">Procurement Spend Analytics — FY 2026</div><button class="btn-sap-outline" data-action="export-po">Export</button></div>
    <div class="metric-row"><div class="metric-card"><div class="metric-label">Total YTD Spend</div><div class="metric-value">${formatCurrency(2830000)}</div><div class="metric-delta">↓ 5% vs FY2025</div></div><div class="metric-card"><div class="metric-label">Active Vendors</div><div class="metric-value">${state.vendors.length}</div><div class="metric-delta">+1 new this quarter</div></div><div class="metric-card"><div class="metric-label">Avg. PO Cycle Time</div><div class="metric-value">4.2d</div><div class="metric-delta">↓ 0.8d vs target</div></div><div class="metric-card"><div class="metric-label">Savings Achieved</div><div class="metric-value" style="color:var(--success);">${formatCurrency(148000)}</div><div class="metric-delta">+12% vs plan</div></div></div>
    <div class="chart-row"><div class="section-card"><div class="section-card-header"><div class="section-card-title">Spend by Material Group (YTD)</div></div><div class="chart-wrap"><canvas id="catChart"></canvas></div></div><div class="section-card"><div class="section-card-header"><div class="section-card-title">Top Vendors by Spend (YTD)</div></div><div class="chart-wrap"><canvas id="vendorChart"></canvas></div></div></div>
    <div class="section-card"><div class="section-card-header"><div class="section-card-title">Spend Trend — Monthly (Jan–Jun 2026)</div></div><div class="chart-wrap"><canvas id="trendChart"></canvas></div></div>
  `;

    chartRenderAnalytics();
}

function renderGoodsReceipt() {
    const section = document.getElementById('view-gr');
    const pendingPOs = state.pos.filter((po) => po.status !== 'Received');
    const selectedPO = pendingPOs[0] || state.pos[0];

    section.innerHTML = `
    <div class="sap-breadcrumb">SAP S/4HANA / MM / MIGO — Goods Receipt for Purchase Order</div>
    <div class="sap-page-header"><div class="sap-page-title">Post Goods Receipt (MIGO)</div><div><button class="btn-sap-outline" data-view="po-list">Cancel</button><button class="btn-sap" id="post-gr">Post (CTRL+G)</button></div></div>
    <div class="section-card"><div class="section-card-header"><div class="section-card-title">Document Header</div></div><div class="header-grid">
      <div class="field-group"><label class="field-label">Transaction</label><select class="sap-select" id="gr-transaction"><option>Goods Receipt</option><option>Return Delivery</option><option>Transfer Posting</option></select></div>
      <div class="field-group"><label class="field-label">Reference Document</label><select class="sap-select" id="gr-reference"><option>Purchase Order</option></select></div>
      <div class="field-group"><label class="field-label">PO Number *</label><select class="sap-select" id="gr-po-number">${pendingPOs.map((po) => `<option value="${po.poNumber}">${po.poNumber} — ${po.vendorName}</option>`).join('')}</select></div>
      <div class="field-group"><label class="field-label">Posting Date</label><input class="sap-input" type="date" id="gr-posting-date" value="${new Date().toISOString().slice(0, 10)}" /></div>
    </div></div>
    <div class="section-card"><div class="section-card-header"><div class="section-card-title">Item Overview</div></div><table class="sap-table" id="gr-items-table"><thead><tr><th><input type="checkbox" id="gr-select-all" /></th><th>Item</th><th>Material</th><th>Description</th><th>OK</th><th>Qty</th><th>UoM</th><th>Open Qty</th><th>Storage Loc.</th><th>Movement Type</th><th>Batch</th></tr></thead><tbody></tbody></table><div id="gr-confirm" class="alert-banner alert-info" style="display:none;"></div></div>
  `;

    section
        .querySelector('[data-view="po-list"]')
        .addEventListener('click', () => renderView('po-list'));
    section
        .querySelector('#post-gr')
        .addEventListener('click', postGoodsReceipt);
    section
        .querySelector('#gr-po-number')
        .addEventListener('change', renderGRItems);
    section
        .querySelector('#gr-select-all')
        .addEventListener('change', (event) => {
            section
                .querySelectorAll(
                    '#gr-items-table tbody input[type="checkbox"]',
                )
                .forEach((box) => (box.checked = event.target.checked));
        });
    renderGRItems();
}

function renderGRItems() {
    const section = document.getElementById('view-gr');
    const poNumber = section.querySelector('#gr-po-number').value;
    const po = state.pos.find((entry) => entry.poNumber === poNumber) || {
        items: [],
    };
    const tbody = section.querySelector('#gr-items-table tbody');

    tbody.innerHTML = po.items
        .map(
            (item) => `
    <tr>
      <td><input type="checkbox" checked /></td>
      <td>${item.item}</td>
      <td style="color:#1565c0;">${item.material}</td>
      <td>${item.description}</td>
      <td><input type="checkbox" checked /></td>
      <td><input class="sap-input" type="number" value="${item.qty}" min="0" /></td>
      <td>${item.uom}</td>
      <td style="color:#2e7d32;font-weight:500;">0</td>
      <td><select class="sap-select"><option>0001 – Main WH</option><option>0002 – Staging</option></select></td>
      <td>101 – GR for PO</td>
      <td><input class="sap-input" placeholder="Optional" /></td>
    </tr>
  `,
        )
        .join('');
}

function postGoodsReceipt() {
    const section = document.getElementById('view-gr');
    const poNumber = section.querySelector('#gr-po-number').value;
    const po = state.pos.find((entry) => entry.poNumber === poNumber);
    if (!po) return;
    po.status = 'Received';
    po.grProgress = 100;
    po.grStatus = 'Full';
    po.changedOn = new Date().toISOString().slice(0, 10);
    po.history.push({
        date: new Date().toISOString().slice(0, 10),
        time: new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
        }),
        user: 'H.MISSAOUI',
        action: 'Goods Receipt Posted',
        document: `5000000${Math.floor(Math.random() * 900) + 1100}`,
        amount: po.netValue,
    });
    saveState();
    section.querySelector('#gr-confirm').textContent =
        `Material document posted · 101 · ${new Date().toISOString().slice(0, 10)}`;
    section.querySelector('#gr-confirm').style.display = 'flex';
    renderGRItems();
}

function renderInvoiceView() {
    const section = document.getElementById('view-invoice');
    const openInvoices = state.pos.filter(
        (po) => po.status === 'Received' || po.status === 'Approved',
    );
    section.innerHTML = `
    <div class="sap-breadcrumb">SAP S/4HANA / MM / MIRO — Invoice Verification</div>
    <div class="sap-page-header"><div class="sap-page-title">Invoice Verification</div><button class="btn-sap-outline" data-view="po-list">Back to POs</button></div>
    <div class="section-card"><table class="sap-table"><thead><tr><th>PO Number</th><th>Vendor</th><th>Status</th><th>Invoice</th><th>Amount</th><th>Action</th></tr></thead><tbody>${openInvoices
        .map(
            (po) => `
      <tr><td>${po.poNumber}</td><td>${po.vendorName}</td><td>${createStatusBadge(po.status)}</td><td>${po.status === 'Received' ? 'Pending' : 'Not started'}</td><td>${formatCurrency(po.netValue)}</td><td>${po.status === 'Received' ? `<button class="btn-sap" data-action="verify-invoice" data-po="${po.poNumber}">Verify</button>` : '—'}</td></tr>
    `,
        )
        .join('')}</tbody></table></div>
  `;
}

function markInvoiceVerified(poNumber) {
    const po = state.pos.find((entry) => entry.poNumber === poNumber);
    if (!po) return;
    po.status = 'Approved';
    po.history.push({
        date: new Date().toISOString().slice(0, 10),
        time: new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
        }),
        user: 'H.MISSAOUI',
        action: 'Invoice Verified',
        document: `R${Math.floor(Math.random() * 900000) + 100000}`,
        amount: po.netValue,
    });
    saveState();
    renderInvoiceView();
    alert(`Invoice for PO ${poNumber} verified.`);
}

function exportPOs() {
    const blob = new Blob([JSON.stringify(state.pos, null, 2)], {
        type: 'application/json',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'purchase-orders.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function refreshData() {
    if (confirm('Reset the app dataset to the original demo values?')) {
        localStorage.removeItem(storageKey);
        loadState();
        renderView('dashboard');
    }
}

function chartRenderDashboard() {
    const spendCtx = document.getElementById('spendChart');
    const statusCtx = document.getElementById('statusChart');
    if (!spendCtx || !statusCtx) return;

    if (charts.spend) charts.spend.destroy();
    if (charts.status) charts.status.destroy();

    charts.spend = new Chart(spendCtx, {
        type: 'bar',
        data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            datasets: [
                {
                    label: 'Electrical',
                    data: [120, 140, 160, 130, 150, 180],
                    backgroundColor: '#1565c0',
                },
                {
                    label: 'Chemicals',
                    data: [80, 90, 100, 85, 110, 95],
                    backgroundColor: '#2e7d32',
                },
                {
                    label: 'Mechanical',
                    data: [50, 60, 70, 55, 65, 80],
                    backgroundColor: '#f57f17',
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { boxWidth: 12, font: { size: 11 } } },
            },
            scales: {
                x: { stacked: true, ticks: { font: { size: 10 } } },
                y: {
                    stacked: true,
                    ticks: {
                        font: { size: 10 },
                        callback: (value) => `€${value}K`,
                    },
                },
            },
        },
    });

    charts.status = new Chart(statusCtx, {
        type: 'doughnut',
        data: {
            labels: ['Approved', 'Ordered', 'Received', 'Pending', 'Draft'],
            datasets: [
                {
                    data: dashboardMetrics.statusBreakdown,
                    backgroundColor: [
                        '#2e7d32',
                        '#1565c0',
                        '#00695c',
                        '#f57f17',
                        '#6a1b9a',
                    ],
                    borderWidth: 0,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '60%',
            plugins: {
                legend: {
                    position: 'right',
                    labels: { boxWidth: 12, font: { size: 11 }, padding: 10 },
                },
            },
        },
    });
}

function chartRenderAnalytics() {
    const cat = document.getElementById('catChart');
    const vendor = document.getElementById('vendorChart');
    const trend = document.getElementById('trendChart');
    if (!cat || !vendor || !trend) return;

    if (charts.cat) charts.cat.destroy();
    if (charts.vendor) charts.vendor.destroy();
    if (charts.trend) charts.trend.destroy();

    charts.cat = new Chart(cat, {
        type: 'bar',
        data: {
            labels: [
                'Control Systems',
                'Electrical',
                'Industrial Gas',
                'Chemicals',
                'Mech. Parts',
                'Safety',
            ],
            datasets: [
                {
                    label: 'Spend (€K)',
                    data: analyticsData.spendByGroup,
                    backgroundColor: '#1565c0',
                },
            ],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: {
                    ticks: {
                        callback: (value) => `€${value}K`,
                        font: { size: 10 },
                    },
                },
                y: { ticks: { font: { size: 10 } } },
            },
        },
    });

    charts.vendor = new Chart(vendor, {
        type: 'bar',
        data: {
            labels: [
                'ABB Ltd',
                'Siemens AG',
                'Linde AG',
                'BASF SE',
                'Bosch',
                'Henkel',
                '3M',
                'ThyssenKrupp',
            ],
            datasets: [
                {
                    label: 'Spend (€K)',
                    data: analyticsData.vendorSpend,
                    backgroundColor: '#2e7d32',
                },
            ],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: {
                    ticks: {
                        callback: (value) => `€${value}K`,
                        font: { size: 10 },
                    },
                },
                y: { ticks: { font: { size: 10 } } },
            },
        },
    });

    charts.trend = new Chart(trend, {
        type: 'line',
        data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            datasets: [
                {
                    label: 'Actual Spend',
                    data: analyticsData.trend.actual,
                    borderColor: '#1565c0',
                    backgroundColor: 'rgba(21,101,192,0.1)',
                    tension: 0.3,
                    fill: true,
                    pointRadius: 4,
                },
                {
                    label: 'Budget',
                    data: analyticsData.trend.budget,
                    borderColor: '#c62828',
                    borderDash: [5, 5],
                    tension: 0,
                    fill: false,
                    pointRadius: 0,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { font: { size: 11 }, boxWidth: 12 } },
            },
            scales: {
                x: { ticks: { font: { size: 10 } } },
                y: {
                    ticks: {
                        font: { size: 10 },
                        callback: (value) => `€${value}K`,
                    },
                },
            },
        },
    });
}

init();
