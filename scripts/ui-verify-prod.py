# -*- coding: utf-8 -*-
"""线上生产环境 UI 验证：新版本导航 + 投稿页 + 游戏详情存档区 + admin 投稿审核"""
from playwright.sync_api import sync_playwright

WEB = 'https://web-production-80fe2.up.railway.app'
ADMIN = 'https://admin-production-b551.up.railway.app'
API = 'https://server-production-8436.up.railway.app/api'
results = []

def check(name, cond, extra=''):
    results.append((name, cond))
    print(('  ✅ ' if cond else '  ❌ ') + name + (f' {extra}' if extra and not cond else ''))

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    # 首页导航
    page.goto(WEB + '/', wait_until='networkidle')
    nav = page.locator('.nav-links').inner_text()
    check('线上导航含「投稿游戏」', '投稿游戏' in nav)
    check('线上导航无「存档银行」', '存档银行' not in nav)
    # 游戏详情页存档区（存档银行标题始终显示）
    page.goto(WEB + '/games/1', wait_until='networkidle')
    detail = page.locator('body').inner_text()
    check('线上游戏详情页有存档银行区', '存档银行' in detail and ('上传 .txt' in detail or '登录' in detail))
    # 投稿页（未登录跳转）
    page.goto(WEB + '/submit', wait_until='networkidle')
    check('线上投稿页可访问', '登录' in page.url or '登录' in page.locator('body').inner_text())
    # admin 投稿审核页（密码从环境变量 PROD_ADMIN_PW 传入，避免明文入库）
    import os
    admin = browser.new_page()
    admin.goto(ADMIN + '/login', wait_until='networkidle')
    admin.locator('.form-group:has(label:has-text("用户名")) input').fill('Winster')
    admin.locator('.form-group:has(label:has-text("密码")) input').fill(os.environ.get('PROD_ADMIN_PW', ''))
    admin.locator('form button').click()
    admin.wait_for_timeout(4000)
    admin.goto(ADMIN + '/submissions', wait_until='networkidle')
    a_body = admin.locator('body').inner_text()
    check('线上后台有投稿审核页', '投稿审核' in a_body)
    check('线上后台侧边栏含投稿审核', '投稿审核' in admin.locator('.sidebar').inner_text())
    admin.close()
    browser.close()

failed = [r for r in results if not r[1]]
print(f"\n══════ 线上验证：{len(results) - len(failed)} 通过 / {len(failed)} 失败 ══════")
import sys
sys.exit(1 if failed else 0)
