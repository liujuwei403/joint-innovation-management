# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Project

```bash
# Local dev server (no build step, no dependencies)
npx serve public -l 3800
```

Pure static frontend — all files in `public/`. No Node.js backend, no bundler, no framework. Designed for GitHub Pages deployment.

## Architecture

**Frontend**: Vanilla HTML/CSS/JS with shared `api.js` (Teable CRUD wrapper) and `style.css` (Aurora dark theme design system).

**Backend**: Teable REST API (Airtable-like) as the sole data store. All CRUD goes through `api.js` functions: `teableGet()`, `teableCreate()`, `teableUpdate()`, `teableDelete()`.

**Auth**: Password stored as plaintext in Teable (internal tool). Login saves user object to `localStorage('badge_user')`. Every page calls `getCurrentUser()` on load — redirects to `index.html` if null. Admin pages check `user.role === '管理员'`.

## Teable Configuration

- **Base URL**: `https://yach-teable.zhiyinlou.com`
- **Base ID**: `bsellQDi8tEOwbyOY2H`
- **Token**: Bearer token in `api.js` line 3

| Constant | Table | Key Fields |
|----------|-------|------------|
| `TABLE_USER` | 勋章用户表 | 账号, 昵称, 密码哈希, 状态(待审核/已激活/已禁用), 角色(普通用户/管理员) |
| `TABLE_BADGE` | 勋章定义表 | 名称, 图标(emoji), 勋章图片(base64 longText), 颜色(hex), 价值分, 分类 |
| `TABLE_AWARD` | 用户勋章表 | 账号, 勋章名称, 授予者, 授予时间, 备注 |
| `TABLE_CALENDAR` | 共创日历表 | 标题, 开始时间, 结束时间, 活动类型, 分享者, 订阅者(comma-separated accounts) |
| `TABLE_SKILLS` | Skills合集 | 名称, 上传者, 功能简介, 触发方式, 版本号 |
| `TABLE_PARTNERS` | 数字伙伴表 | 编号, 名称, 链接, 功能概述, 使用量, 开发者 |
| `TABLE_TRACKING` | 操作追踪表 | 时间, 账号, 昵称, 页面, 操作 |

**Creating Teable tables**: Must use Node.js `fetch()` (not curl) to send Chinese field names — Windows bash curl mangles UTF-8 to GBK.

## Pages

| File | Role |
|------|------|
| `index.html` | Login/register with particle animation |
| `home.html` | Dashboard: stats cards + navigation tiles |
| `gallery.html` | Personal badge wall: earned (glowing) + locked (greyed), filter buttons |
| `calendar.html` | Event calendar: list/grid view, subscribe/unsubscribe, admin CRUD |
| `achievements.html` | 5-module showcase: activities, skills, partners, agent(placeholder), web(iframe) |
| `admin.html` | 5-tab admin: users, badges, awards, member overview, calendar stats |

## Key Patterns

**Data loading**: `Promise.all()` to fetch multiple tables in parallel, then render.

**Badge tier system** (`api.js`): `getBadgeTier(score)` maps value score to 4 tiers (普通/稀有/史诗/传说) with star ratings. `renderBadgeCard()` and `renderLockedBadgeCard()` handle earned vs unearned display.

**Badge images**: Admin uploads PNG/JPG/GIF (max 500KB), converted to base64 Data URL stored in `勋章图片` longText field. Falls back to emoji `图标` field.

**Calendar subscriptions**: Stored as comma-separated account strings in `订阅者` field. `getEventStatus()` auto-calculates 未开始/进行中/已结束 from timestamps.

**Navigation**: Every page has identical `<nav>` with admin link hidden via `.admin-link { display: none }` + JS `style.display = 'inline-block'` for admins.

**Password change**: `openPwdModal()` in `api.js` dynamically injects modal into DOM on first call. Available on all pages via nav bar.

## External Integrations

- **知音楼 (Yach) docs**: Readable via `doc/content` API with `file_url` param (even short links work). Write via `agent/chat` Dify workflow. Token: appkey `43a90637928105cc`.
- **阿拉丁 platform**: Embedded as iframe in achievements page. SPA — requires browser automation (agent-browser) to scrape content.
- **Teable attachment fields**: This deployment has no upload API. Use base64 in longText fields instead.
