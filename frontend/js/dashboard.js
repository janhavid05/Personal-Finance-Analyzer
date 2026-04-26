const API_URL = 'http://localhost:5000/api';
let currentUser = null;
let currentMonth = 'All Time';
let pieChartInstance = null;
let barChartInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
        window.location.href = 'index.html';
        return;
    }
    currentUser = JSON.parse(userStr);

    setupNavigation();
    setupDashboard();
    loadCategories();
    
    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('user');
        window.location.href = 'index.html';
    });

    document.getElementById('monthFilter').addEventListener('change', (e) => {
        currentMonth = e.target.value;
        loadDashboardData();
    });

    document.getElementById('exportBtn').addEventListener('click', exportToPDF);
    document.getElementById('addExpenseForm').addEventListener('submit', handleAddExpense);
    document.getElementById('budgetForm').addEventListener('submit', handleUpdateBudget);
    document.getElementById('addCategoryForm').addEventListener('submit', handleAddCategory);
    document.getElementById('comparisonForm').addEventListener('submit', handleComparison);
});

// ==================== NAVIGATION ====================

function setupNavigation() {
    const navLinks = {
        'nav-dashboard': 'view-dashboard',
        'nav-add-expense': 'view-add-expense',
        'nav-expenses': 'view-expenses',
        'nav-budget': 'view-budget',
        'nav-categories': 'view-categories',
        'nav-stats': 'view-stats',
        'nav-comparison': 'view-comparison'
    };

    const exportBtn = document.getElementById('exportBtn');

    for (const [navId, viewId] of Object.entries(navLinks)) {
        document.getElementById(navId).addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
            e.target.parentElement.classList.add('active');
            document.querySelectorAll('.view').forEach(view => view.style.display = 'none');
            document.getElementById(viewId).style.display = 'block';
            document.getElementById('page-title').innerText = e.target.innerText;

            if (viewId === 'view-dashboard') {
                exportBtn.style.display = 'inline-block';
                loadDashboardData();
            } else {
                exportBtn.style.display = 'none';
            }
            
            if (viewId === 'view-expenses') loadExpenses();
            if (viewId === 'view-categories') loadCategoriesList();
            if (viewId === 'view-stats') loadExpenseStats();
        });
    }
}

// ==================== DASHBOARD ====================

async function setupDashboard() {
    await loadDashboardData();
    loadBudgetAlerts();
}

async function loadDashboardData() {
    try {
        const response = await fetch(`${API_URL}/dashboard?user_id=${currentUser.id}&month=${currentMonth}`);
        if (!response.ok) throw new Error('Failed to load dashboard data');
        const data = await response.json();
        
        document.getElementById('netWorth').innerText = `₹${data.net_worth.toFixed(2)}`;
        document.getElementById('totalExpenses').innerText = `₹${data.total_expenses.toFixed(2)}`;
        document.getElementById('targetBudget').innerText = data.target_budget ? `₹${data.target_budget.toFixed(2)}` : 'Not Set';
        document.getElementById('totalTransactions').innerText = data.total_transactions;
        document.getElementById('highestExpense').innerText = data.highest_expense;

        renderPieChart(data.category_breakdown);
        renderBarChart(data.category_breakdown);
        loadBudgetAlerts();
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
    }
}

// ==================== BUDGET ALERTS ====================

async function loadBudgetAlerts() {
    try {
        const response = await fetch(`${API_URL}/budget-alerts?user_id=${currentUser.id}`);
        if (!response.ok) return;
        const alerts = await response.json();
        
        const container = document.getElementById('budget-alerts-container');
        const list = document.getElementById('budget-alerts-list');
        
        if (!alerts || alerts.length === 0) {
            container.style.display = 'none';
            return;
        }
        
        container.style.display = 'block';
        list.innerHTML = '';
        
        alerts.forEach(alert => {
            const colors = {
                exceeded: { bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.5)', icon: '🚨', text: '#ff6b6b' },
                warning: { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.5)', icon: '⚠️', text: '#fbbf24' },
                caution: { bg: 'rgba(234, 179, 8, 0.15)', border: 'rgba(234, 179, 8, 0.4)', icon: '📢', text: '#facc15' },
                safe: { bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.4)', icon: '✅', text: '#34d399' }
            };
            const c = colors[alert.alert_level] || colors.safe;
            
            const card = document.createElement('div');
            card.className = 'alert-card';
            card.style.cssText = `background:${c.bg}; border:1px solid ${c.border};`;
            
            card.innerHTML = `
                <div class="alert-card-header">
                    <span class="alert-icon">${c.icon}</span>
                    <span class="alert-month">${alert.month}</span>
                </div>
                <div class="alert-progress-bar">
                    <div class="alert-progress-fill" style="width:${Math.min(alert.percentage, 100)}%; background:${c.text};"></div>
                </div>
                <div class="alert-details">
                    <span>₹${alert.spent.toFixed(0)} / ₹${alert.budget.toFixed(0)}</span>
                    <span style="color:${c.text}; font-weight:700;">${alert.percentage}%</span>
                </div>
            `;
            list.appendChild(card);
        });
    } catch (error) {
        console.error('Error loading budget alerts:', error);
    }
}

// ==================== CATEGORIES CRUD ====================

async function loadCategoriesList() {
    try {
        const response = await fetch(`${API_URL}/categories`);
        if (!response.ok) return;
        const categories = await response.json();
        
        const container = document.getElementById('categoriesList');
        container.innerHTML = '';
        
        categories.forEach(cat => {
            const item = document.createElement('div');
            item.className = 'category-item';
            item.innerHTML = `
                <span class="category-name"><span class="badge">${cat.name}</span></span>
                <button class="btn-delete-cat" onclick="deleteCategory(${cat.id}, '${cat.name}')">✕</button>
            `;
            container.appendChild(item);
        });
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

async function handleAddCategory(e) {
    e.preventDefault();
    const name = document.getElementById('newCategoryName').value.trim();
    if (!name) return;
    
    try {
        const response = await fetch(`${API_URL}/categories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const data = await response.json();
        if (response.ok) {
            alert('Category added!');
            document.getElementById('newCategoryName').value = '';
            loadCategoriesList();
            loadCategories();
        } else {
            alert(data.message);
        }
    } catch (error) {
        console.error('Error adding category:', error);
    }
}

async function deleteCategory(id, name) {
    if (!confirm(`Delete category "${name}"?`)) return;
    try {
        const response = await fetch(`${API_URL}/categories/${id}`, { method: 'DELETE' });
        const data = await response.json();
        if (response.ok) {
            alert('Category deleted!');
            loadCategoriesList();
            loadCategories();
        } else {
            alert(data.message);
        }
    } catch (error) {
        console.error('Error deleting category:', error);
    }
}

// ==================== EXPENSE STATISTICS ====================

async function loadExpenseStats() {
    try {
        const response = await fetch(`${API_URL}/expense-stats?user_id=${currentUser.id}`);
        if (!response.ok) return;
        const stats = await response.json();
        
        document.getElementById('statAvgDaily').innerText = `₹${stats.avg_daily_spend.toFixed(2)}`;
        document.getElementById('statHighestDay').innerText = stats.highest_spend_day.date;
        document.getElementById('statHighestDayAmount').innerText = `₹${stats.highest_spend_day.amount.toFixed(2)}`;
        document.getElementById('statLowestDay').innerText = stats.lowest_spend_day.date;
        document.getElementById('statLowestDayAmount').innerText = `₹${stats.lowest_spend_day.amount.toFixed(2)}`;
        document.getElementById('statActiveDays').innerText = stats.total_active_days;
        document.getElementById('statFreqCategory').innerText = stats.most_frequent_category;
        document.getElementById('statAvgTransaction').innerText = `₹${stats.avg_transaction_amount.toFixed(2)}`;
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// ==================== MONTHLY COMPARISON ====================

async function handleComparison(e) {
    e.preventDefault();
    const current = document.getElementById('compareCurrentMonth').value;
    const previous = document.getElementById('comparePreviousMonth').value;
    
    if (current === previous) {
        alert('Please select two different months');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/expense-comparison?user_id=${currentUser.id}&current_month=${current}&previous_month=${previous}`);
        if (!response.ok) return;
        const data = await response.json();
        
        const resultDiv = document.getElementById('comparisonResult');
        resultDiv.style.display = 'block';
        
        const trendIcon = data.trend === 'increased' ? '📈' : (data.trend === 'decreased' ? '📉' : '➡️');
        const trendColor = data.trend === 'increased' ? '#ef4444' : (data.trend === 'decreased' ? '#10b981' : '#f59e0b');
        
        let catRows = '';
        if (data.category_comparison && data.category_comparison.length > 0) {
            catRows = data.category_comparison.map(c => {
                const diff = c.current_amount - c.previous_amount;
                const diffColor = diff > 0 ? '#ef4444' : (diff < 0 ? '#10b981' : '#94a3b8');
                const diffSign = diff > 0 ? '+' : '';
                return `<tr>
                    <td><span class="badge">${c.name}</span></td>
                    <td>₹${c.previous_amount.toFixed(2)}</td>
                    <td>₹${c.current_amount.toFixed(2)}</td>
                    <td style="color:${diffColor}; font-weight:600;">${diffSign}₹${diff.toFixed(2)}</td>
                </tr>`;
            }).join('');
        }
        
        resultDiv.innerHTML = `
            <div class="comparison-summary">
                <div class="comparison-card glass">
                    <h4>${data.previous_month}</h4>
                    <h2>₹${data.previous_total.toFixed(2)}</h2>
                </div>
                <div class="comparison-arrow">
                    <span style="font-size:32px">${trendIcon}</span>
                    <span class="change-pct" style="color:${trendColor}">${data.change_percentage > 0 ? '+' : ''}${data.change_percentage}%</span>
                </div>
                <div class="comparison-card glass">
                    <h4>${data.current_month}</h4>
                    <h2>₹${data.current_total.toFixed(2)}</h2>
                </div>
            </div>
            ${catRows ? `
            <div class="table-responsive" style="margin-top:24px;">
                <table class="data-table">
                    <thead><tr><th>Category</th><th>${data.previous_month}</th><th>${data.current_month}</th><th>Change</th></tr></thead>
                    <tbody>${catRows}</tbody>
                </table>
            </div>` : ''}
        `;
    } catch (error) {
        console.error('Error loading comparison:', error);
    }
}

// ==================== EXISTING FEATURES ====================

async function loadCategories() {
    try {
        const response = await fetch(`${API_URL}/categories`);
        if (response.ok) {
            const categories = await response.json();
            const select = document.getElementById('expCategory');
            select.innerHTML = '';
            categories.forEach(c => {
                const option = document.createElement('option');
                option.value = c.id;
                option.textContent = c.name;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

async function handleAddExpense(e) {
    e.preventDefault();
    const payload = {
        user_id: currentUser.id,
        amount: document.getElementById('expAmount').value,
        category_id: document.getElementById('expCategory').value,
        billing_month: document.getElementById('expMonth').value,
        transaction_date: document.getElementById('expDate').value,
        description: document.getElementById('expDesc').value
    };

    try {
        const response = await fetch(`${API_URL}/expenses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (response.ok) {
            alert('Expense added successfully!');
            document.getElementById('addExpenseForm').reset();
            loadDashboardData();
        }
    } catch (error) {
        console.error('Error saving expense:', error);
    }
}

async function loadExpenses() {
    try {
        const response = await fetch(`${API_URL}/expenses?user_id=${currentUser.id}&month=${currentMonth}`);
        if (response.ok) {
            const expenses = await response.json();
            const tbody = document.getElementById('expensesTableBody');
            tbody.innerHTML = '';
            expenses.forEach(e => {
                tbody.innerHTML += `
                    <tr>
                        <td>${e.date}</td>
                        <td>${e.billing_month}</td>
                        <td><span class="badge">${e.category_name}</span></td>
                        <td>${e.description}</td>
                        <td>₹${e.amount}</td>
                    </tr>
                `;
            });
        }
    } catch (error) {
        console.error('Error loading expenses:', error);
    }
}

async function handleUpdateBudget(e) {
    e.preventDefault();
    const payload = {
        user_id: currentUser.id,
        month: document.getElementById('budgetMonth').value,
        amount: document.getElementById('budgetAmount').value
    };

    try {
        const response = await fetch(`${API_URL}/budget`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (response.ok) {
            alert('Budget updated successfully!');
            document.getElementById('budgetForm').reset();
            loadDashboardData();
        }
    } catch (error) {
        console.error('Error updating budget:', error);
    }
}

// ==================== CHARTS ====================

const brightColors = ['#a78bfa', '#60a5fa', '#34d399', '#fbbf24', '#f87171', '#c084fc', '#f472b6', '#2dd4bf', '#fb923c', '#38bdf8'];

function renderPieChart(data) {
    const ctx = document.getElementById('pieChart').getContext('2d');
    const labels = data.map(d => `${d.name} - ₹${parseFloat(d.total).toLocaleString()}`);
    const values = data.map(d => parseFloat(d.total));

    if (pieChartInstance) pieChartInstance.destroy();

    pieChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: brightColors,
                borderWidth: 2,
                borderColor: '#0f172a'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#e2e8f0',
                        font: { size: 13, family: 'Outfit' },
                        padding: 16,
                        usePointStyle: true,
                        pointStyleWidth: 12
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleColor: '#f8fafc',
                    bodyColor: '#cbd5e1',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 12,
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = ((context.parsed / total) * 100).toFixed(1);
                            return ` ₹${context.parsed.toLocaleString()} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });
}

function renderBarChart(data) {
    const ctx = document.getElementById('barChart').getContext('2d');
    const labels = data.map(d => `${d.name} - ₹${parseFloat(d.total).toLocaleString()}`);
    const values = data.map(d => parseFloat(d.total));

    if (barChartInstance) barChartInstance.destroy();

    barChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Expenses by Category (₹)',
                data: values,
                backgroundColor: brightColors.slice(0, labels.length),
                borderRadius: 8,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleColor: '#f8fafc',
                    bodyColor: '#cbd5e1',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 12,
                    callbacks: {
                        label: function(context) {
                            return ` ₹${context.parsed.y.toLocaleString()}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#94a3b8', font: { size: 13, family: 'Outfit' } },
                    grid: { display: false }
                },
                y: {
                    ticks: {
                        color: '#94a3b8',
                        font: { size: 12, family: 'Outfit' },
                        callback: function(value) { return '₹' + value.toLocaleString(); }
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        }
    });
}

function exportToPDF() {
    const element = document.getElementById('view-dashboard');
    // Hide AI section and alerts for cleaner PDF
    const aiSection = document.querySelector('.ai-insights-section');
    const alertSection = document.getElementById('budget-alerts-container');
    if (aiSection) aiSection.style.display = 'none';
    const alertDisplay = alertSection ? alertSection.style.display : 'none';
    if (alertSection) alertSection.style.display = 'none';

    const opt = {
        margin: [10, 10, 10, 10],
        filename: 'Finance_Report.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, scrollY: 0 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'], avoid: ['.card', '.chart-card', '.charts-container'] }
    };
    html2pdf().set(opt).from(element).save().then(() => {
        if (aiSection) aiSection.style.display = '';
        if (alertSection) alertSection.style.display = alertDisplay;
    });
}
