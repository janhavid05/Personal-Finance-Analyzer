from flask import Flask, request, jsonify
from flask_cors import CORS
import mysql.connector
from mysql.connector import Error
import datetime
import os
import json
from dotenv import load_dotenv
# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)

# Database connection configuration
db_config = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'user': os.getenv('DB_USER', 'root'),
    'password': os.getenv('DB_PASSWORD', 'Priti@_30'),
    'database': os.getenv('DB_NAME', 'finance_analyzer')
}

def get_db_connection():
    try:
        connection = mysql.connector.connect(**db_config)
        if connection.is_connected():
            return connection
    except Error as e:
        print(f"Error while connecting to MySQL: {e}")
        return None

# ==================== AUTH ROUTES ====================

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')

    if not name or not email or not password:
        return jsonify({'message': 'Missing required fields'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'message': 'Database connection failed'}), 500

    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE email = %s", (email,))
        if cursor.fetchone():
            return jsonify({'message': 'Email already registered'}), 400

        cursor.execute("INSERT INTO users (name, email, password) VALUES (%s, %s, %s)", (name, email, password))
        conn.commit()
        return jsonify({'message': 'Registration successful'}), 201
    except Error as e:
        return jsonify({'message': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({'message': 'Missing email or password'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'message': 'Database connection failed'}), 500

    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id, name, email FROM users WHERE email = %s AND password = %s", (email, password))
        user = cursor.fetchone()
        
        if user:
            return jsonify({'message': 'Login successful', 'user': user}), 200
        else:
            return jsonify({'message': 'Invalid credentials'}), 401
    except Error as e:
        return jsonify({'message': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ==================== DASHBOARD ROUTE ====================

@app.route('/api/dashboard', methods=['GET'])
def get_dashboard():
    user_id = request.args.get('user_id')
    month = request.args.get('month')
    
    if not user_id:
        return jsonify({'message': 'User ID required'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'message': 'Database connection failed'}), 500

    try:
        cursor = conn.cursor(dictionary=True)
        
        total_income = 0
        
        expense_query = "SELECT SUM(amount) as total FROM expenses WHERE user_id = %s"
        expense_params = [user_id]
        if month and month != 'All Time':
            expense_query += " AND billing_month = %s"
            expense_params.append(month)
        
        cursor.execute(expense_query, tuple(expense_params))
        total_expenses = cursor.fetchone()['total'] or 0
        
        budget_query = "SELECT SUM(amount) as total FROM budgets WHERE user_id = %s"
        budget_params = [user_id]
        if month and month != 'All Time':
            budget_query += " AND month = %s"
            budget_params.append(month)
            
        cursor.execute(budget_query, tuple(budget_params))
        target_budget = cursor.fetchone()['total'] or 0
        
        cursor.execute("SELECT COUNT(id) as count FROM expenses WHERE user_id = %s", (user_id,))
        total_transactions = cursor.fetchone()['count'] or 0
        
        cursor.execute("""
            SELECT c.name, SUM(e.amount) as total 
            FROM expenses e 
            JOIN categories c ON e.category_id = c.id 
            WHERE e.user_id = %s 
            GROUP BY c.name
        """, (user_id,))
        category_breakdown = cursor.fetchall()
        
        highest_expense = 'None'
        if category_breakdown:
            highest_expense = max(category_breakdown, key=lambda x:x['total'])['name']
        
        net_worth = float(target_budget) - float(total_expenses)
        
        return jsonify({
            'total_income': total_income,
            'total_expenses': float(total_expenses),
            'target_budget': float(target_budget),
            'net_worth': net_worth,
            'total_transactions': total_transactions,
            'highest_expense': highest_expense,
            'category_breakdown': category_breakdown
        }), 200
        
    except Error as e:
        return jsonify({'message': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ==================== EXPENSES ROUTES ====================

@app.route('/api/expenses', methods=['GET', 'POST'])
def manage_expenses():
    conn = get_db_connection()
    if not conn:
        return jsonify({'message': 'Database connection failed'}), 500

    try:
        cursor = conn.cursor(dictionary=True)
        
        if request.method == 'POST':
            data = request.json
            user_id = data.get('user_id')
            amount = data.get('amount')
            category_id = data.get('category_id')
            billing_month = data.get('billing_month')
            transaction_date = data.get('transaction_date')
            description = data.get('description', '')
            
            if not user_id or not amount or not category_id or not billing_month or not transaction_date:
                return jsonify({'message': 'Missing required fields'}), 400
                
            cursor.execute("""
                INSERT INTO expenses (user_id, category_id, amount, description, transaction_date, billing_month)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (user_id, category_id, amount, description, transaction_date, billing_month))
            conn.commit()
            return jsonify({'message': 'Expense added successfully'}), 201
            
        elif request.method == 'GET':
            user_id = request.args.get('user_id')
            month = request.args.get('month')
            
            if not user_id:
                return jsonify({'message': 'User ID required'}), 400
                
            query = """
                SELECT e.id, e.amount, e.description, DATE_FORMAT(e.transaction_date, '%d-%m-%Y') as date, 
                       e.billing_month, c.name as category_name
                FROM expenses e
                JOIN categories c ON e.category_id = c.id
                WHERE e.user_id = %s
            """
            params = [user_id]
            if month and month != 'All Time':
                query += " AND e.billing_month = %s"
                params.append(month)
                
            query += " ORDER BY e.transaction_date DESC"
            
            cursor.execute(query, tuple(params))
            expenses = cursor.fetchall()
            return jsonify(expenses), 200

    except Error as e:
        return jsonify({'message': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ==================== CATEGORIES ROUTES (CRUD) ====================

@app.route('/api/categories', methods=['GET'])
def get_categories():
    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM categories")
        categories = cursor.fetchall()
        return jsonify(categories), 200
    except Error as e:
        return jsonify({'message': str(e)}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/categories', methods=['POST'])
def add_category():
    data = request.json
    name = data.get('name', '').strip()
    
    if not name:
        return jsonify({'message': 'Category name is required'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'message': 'Database connection failed'}), 500

    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id FROM categories WHERE name = %s", (name,))
        if cursor.fetchone():
            return jsonify({'message': 'Category already exists'}), 400
        
        cursor.execute("INSERT INTO categories (name) VALUES (%s)", (name,))
        conn.commit()
        new_id = cursor.lastrowid
        return jsonify({'message': 'Category added successfully', 'id': new_id, 'name': name}), 201
    except Error as e:
        return jsonify({'message': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/categories/<int:category_id>', methods=['DELETE'])
def delete_category(category_id):
    conn = get_db_connection()
    if not conn:
        return jsonify({'message': 'Database connection failed'}), 500

    try:
        cursor = conn.cursor(dictionary=True)
        # Check if category has expenses
        cursor.execute("SELECT COUNT(*) as count FROM expenses WHERE category_id = %s", (category_id,))
        count = cursor.fetchone()['count']
        if count > 0:
            return jsonify({'message': f'Cannot delete: {count} expenses use this category'}), 400
        
        cursor.execute("DELETE FROM categories WHERE id = %s", (category_id,))
        if cursor.rowcount == 0:
            return jsonify({'message': 'Category not found'}), 404
        conn.commit()
        return jsonify({'message': 'Category deleted successfully'}), 200
    except Error as e:
        return jsonify({'message': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ==================== BUDGET ROUTES ====================

@app.route('/api/budget', methods=['POST'])
def update_budget():
    data = request.json
    user_id = data.get('user_id')
    month = data.get('month')
    amount = data.get('amount')
    
    if not user_id or not month or not amount:
        return jsonify({'message': 'Missing required fields'}), 400
        
    conn = get_db_connection()
    if not conn:
        return jsonify({'message': 'Database connection failed'}), 500

    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO budgets (user_id, month, amount) 
            VALUES (%s, %s, %s) 
            ON DUPLICATE KEY UPDATE amount = %s
        """, (user_id, month, amount, amount))
        conn.commit()
        return jsonify({'message': 'Budget updated successfully'}), 200
    except Error as e:
        return jsonify({'message': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ==================== BUDGET ALERTS ====================

@app.route('/api/budget-alerts', methods=['GET'])
def get_budget_alerts():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({'message': 'User ID required'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'message': 'Database connection failed'}), 500

    try:
        cursor = conn.cursor(dictionary=True)
        
        # Get all budgets for this user
        cursor.execute("SELECT month, amount FROM budgets WHERE user_id = %s", (user_id,))
        budgets = cursor.fetchall()
        
        alerts = []
        for budget in budgets:
            month_name = budget['month']
            budget_amount = float(budget['amount'])
            
            # Get total expenses for this month
            cursor.execute(
                "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = %s AND billing_month = %s",
                (user_id, month_name)
            )
            spent = float(cursor.fetchone()['total'])
            
            if budget_amount > 0:
                percentage = (spent / budget_amount) * 100
            else:
                percentage = 0
            
            alert_level = 'safe'  # green
            if percentage >= 100:
                alert_level = 'exceeded'  # red
            elif percentage >= 80:
                alert_level = 'warning'  # orange/yellow
            elif percentage >= 60:
                alert_level = 'caution'  # yellow
            
            alerts.append({
                'month': month_name,
                'budget': budget_amount,
                'spent': spent,
                'remaining': budget_amount - spent,
                'percentage': round(percentage, 1),
                'alert_level': alert_level
            })
        
        # Sort: exceeded first, then warning, then caution, then safe
        level_order = {'exceeded': 0, 'warning': 1, 'caution': 2, 'safe': 3}
        alerts.sort(key=lambda x: level_order.get(x['alert_level'], 4))
        
        return jsonify(alerts), 200
        
    except Error as e:
        return jsonify({'message': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ==================== EXPENSE STATISTICS ====================

@app.route('/api/expense-stats', methods=['GET'])
def get_expense_stats():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({'message': 'User ID required'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'message': 'Database connection failed'}), 500

    try:
        cursor = conn.cursor(dictionary=True)
        
        # Average daily spend
        cursor.execute("""
            SELECT AVG(daily_total) as avg_daily FROM (
                SELECT transaction_date, SUM(amount) as daily_total
                FROM expenses WHERE user_id = %s
                GROUP BY transaction_date
            ) as daily_sums
        """, (user_id,))
        avg_daily = cursor.fetchone()['avg_daily'] or 0
        
        # Highest spend day
        cursor.execute("""
            SELECT transaction_date, SUM(amount) as total
            FROM expenses WHERE user_id = %s
            GROUP BY transaction_date
            ORDER BY total DESC LIMIT 1
        """, (user_id,))
        highest_day_row = cursor.fetchone()
        highest_day = {
            'date': str(highest_day_row['transaction_date']) if highest_day_row else 'N/A',
            'amount': float(highest_day_row['total']) if highest_day_row else 0
        }
        
        # Lowest spend day
        cursor.execute("""
            SELECT transaction_date, SUM(amount) as total
            FROM expenses WHERE user_id = %s
            GROUP BY transaction_date
            ORDER BY total ASC LIMIT 1
        """, (user_id,))
        lowest_day_row = cursor.fetchone()
        lowest_day = {
            'date': str(lowest_day_row['transaction_date']) if lowest_day_row else 'N/A',
            'amount': float(lowest_day_row['total']) if lowest_day_row else 0
        }
        
        # Total unique days with expenses
        cursor.execute("""
            SELECT COUNT(DISTINCT transaction_date) as days
            FROM expenses WHERE user_id = %s
        """, (user_id,))
        total_days = cursor.fetchone()['days'] or 0
        
        # Most frequent category
        cursor.execute("""
            SELECT c.name, COUNT(e.id) as freq
            FROM expenses e JOIN categories c ON e.category_id = c.id
            WHERE e.user_id = %s
            GROUP BY c.name ORDER BY freq DESC LIMIT 1
        """, (user_id,))
        freq_row = cursor.fetchone()
        most_frequent_category = freq_row['name'] if freq_row else 'N/A'
        
        # Average transaction amount
        cursor.execute("""
            SELECT AVG(amount) as avg_amount FROM expenses WHERE user_id = %s
        """, (user_id,))
        avg_transaction = cursor.fetchone()['avg_amount'] or 0
        
        # Monthly spending trend (all months)
        cursor.execute("""
            SELECT billing_month, SUM(amount) as total
            FROM expenses WHERE user_id = %s
            GROUP BY billing_month
        """, (user_id,))
        monthly_trend = cursor.fetchall()
        
        return jsonify({
            'avg_daily_spend': round(float(avg_daily), 2),
            'highest_spend_day': highest_day,
            'lowest_spend_day': lowest_day,
            'total_active_days': total_days,
            'most_frequent_category': most_frequent_category,
            'avg_transaction_amount': round(float(avg_transaction), 2),
            'monthly_trend': monthly_trend
        }), 200
        
    except Error as e:
        return jsonify({'message': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ==================== MONTHLY EXPENSE COMPARISON ====================

@app.route('/api/expense-comparison', methods=['GET'])
def get_expense_comparison():
    user_id = request.args.get('user_id')
    current_month = request.args.get('current_month')
    previous_month = request.args.get('previous_month')
    
    if not user_id or not current_month or not previous_month:
        return jsonify({'message': 'user_id, current_month, and previous_month are required'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'message': 'Database connection failed'}), 500

    try:
        cursor = conn.cursor(dictionary=True)
        
        # Current month total
        cursor.execute(
            "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = %s AND billing_month = %s",
            (user_id, current_month)
        )
        current_total = float(cursor.fetchone()['total'])
        
        # Previous month total
        cursor.execute(
            "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = %s AND billing_month = %s",
            (user_id, previous_month)
        )
        previous_total = float(cursor.fetchone()['total'])
        
        # Percentage change
        if previous_total > 0:
            change_pct = ((current_total - previous_total) / previous_total) * 100
        else:
            change_pct = 100 if current_total > 0 else 0
        
        # Category-wise comparison
        cursor.execute("""
            SELECT c.name,
                COALESCE(SUM(CASE WHEN e.billing_month = %s THEN e.amount END), 0) as current_amount,
                COALESCE(SUM(CASE WHEN e.billing_month = %s THEN e.amount END), 0) as previous_amount
            FROM categories c
            LEFT JOIN expenses e ON c.id = e.category_id AND e.user_id = %s
            GROUP BY c.name
            HAVING current_amount > 0 OR previous_amount > 0
        """, (current_month, previous_month, user_id))
        category_comparison = cursor.fetchall()
        
        # Convert Decimals to floats
        for item in category_comparison:
            item['current_amount'] = float(item['current_amount'])
            item['previous_amount'] = float(item['previous_amount'])
        
        trend = 'increased' if change_pct > 0 else ('decreased' if change_pct < 0 else 'unchanged')
        
        return jsonify({
            'current_month': current_month,
            'previous_month': previous_month,
            'current_total': current_total,
            'previous_total': previous_total,
            'change_percentage': round(change_pct, 1),
            'trend': trend,
            'category_comparison': category_comparison
        }), 200
        
    except Error as e:
        return jsonify({'message': str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

if __name__ == '__main__':
    app.run(debug=True, port=5000)
