# -*- coding: utf-8 -*-
"""端到端 UI 验证：投稿页 / 游戏详情存档区 / 导航 / 后台投稿审核"""
import sys
from playwright.sync_api import sync_playwright

WEB = 'http://localhost:5173'
ADMIN = 'http://localhost:5174'
results = []

def check(name, cond, extra=''):
    results.append((name, cond, extra))
    print(('  ✅ ' if cond else '  ❌ ') + name + (f' {extra}' if extra and not cond else ''))

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    console_errors = []
    page.on('console', lambda m: console_errors.append(m.text) if m.type == 'error' else None)

    # ── 1. 首页导航 ──
    page.goto(WEB + '/', wait_until='networkidle')
    nav_text = page.locator('.nav-links').inner_text()
    check('导航含「投稿游戏」', '投稿游戏' in nav_text)
    check('导航不含「存档银行」', '存档银行' not in nav_text)

    # ── 2. 未登录访问 /submit → 跳转登录 ──
    page.goto(WEB + '/submit', wait_until='networkidle')
    check('未登录投稿页跳转登录', '/login' in page.url or '登录' in page.locator('body').inner_text())

    # ── 3. 注册并登录 → /submit 表单 ──
    suffix = str(__import__('time').time()).replace('.', '')[-6:]
    page.goto(WEB + '/register', wait_until='networkidle')
    page.locator('.form-group:has(label:has-text("昵称")) input').fill(f'ui测试{suffix}')
    page.locator('.form-group:has(label:has-text("邮箱")) input').fill(f'ui{suffix}@test.com')
    page.locator('.form-group:has(label:has-text("密码")) input').first.fill('test123456')
    page.locator('.form-group:has(label:has-text("确认密码")) input').fill('test123456')
    page.locator('.form-card button').click()
    page.wait_for_timeout(2500)
    page.goto(WEB + '/submit', wait_until='networkidle')
    body = page.locator('body').inner_text()
    check('登录后可见投稿表单', '游戏标题' in body and '汉化链接' in body)
    check('可见我的投稿列表', '我的投稿' in body)

    # 填写并提交投稿
    def fill_by_label(text, value):
        label = page.locator(f'label:has-text("{text}")').first
        box = label.locator('..').locator('input, textarea').first
        box.fill(value)
    fill_by_label('游戏标题', f'UI测试投稿{suffix}')
    fill_by_label('游戏简介', '这是一条通过 UI 自动化测试提交的游戏简介，用于验证投稿功能。')
    fill_by_label('原版链接', 'https://example.com')
    fill_by_label('汉化链接', 'https://example.com/cn')
    page.click('button:has-text("提交投稿")')
    page.wait_for_timeout(2000)
    body2 = page.locator('body').inner_text()
    check('投稿提交成功提示', '等待管理员审核' in body2 or '投稿成功' in body2)

    # ── 4. 游戏详情页存档区 ──
    page.goto(WEB + '/games/1', wait_until='networkidle')
    detail = page.locator('body').inner_text()
    check('详情页有存档银行区', '存档银行' in detail and '上传 .txt' in detail)

    # ── 5. 管理后台：登录 → 投稿审核页 ──
    admin_page = browser.new_page()
    admin_page.goto(ADMIN + '/admin/login', wait_until='networkidle')
    admin_page.locator('.form-group:has(label:has-text("用户名")) input').fill('Winster')
    admin_page.locator('.form-group:has(label:has-text("密码")) input').fill('Winster@2025')
    admin_page.locator('form button').click()
    admin_page.wait_for_timeout(2500)
    admin_page.goto(ADMIN + '/submissions', wait_until='networkidle')
    a_body = admin_page.locator('body').inner_text()
    check('后台有投稿审核页', '投稿审核' in a_body and '待审核' in a_body)
    check('后台侧边栏含投稿审核', '投稿审核' in admin_page.locator('.sidebar').inner_text())
    admin_page.close()

    # ── 控制台错误 ──
    real_errors = [e for e in console_errors if 'favicon' not in e and '404' not in e]
    check('web 无控制台 JS 错误', len(real_errors) == 0, f'errors={real_errors[:3]}')

    browser.close()

failed = [r for r in results if not r[1]]
print(f"\n══════ UI 验证：{len(results) - len(failed)} 通过 / {len(failed)} 失败 ══════")
sys.exit(1 if failed else 0)
