// ─── Teable API 配置 ─────────────────────────────────────────────
const TEABLE_BASE   = 'https://yach-teable.zhiyinlou.com';
const TEABLE_TOKEN  = 'teable_accrGoCYgJwpCP4Hy7H_CJNj3/ERLDcxs8cNekS0vxalbXtPNbnTphkd5Qhccz8=';
const TABLE_USER    = 'tblL9bI0Oc8WTMiZyDN';
const TABLE_BADGE   = 'tblURak3qtlMfdSkcsw';
const TABLE_AWARD   = 'tblAFkIIbOXzOd6A9aL';
const TABLE_CALENDAR = 'tblXG0tJWYIHWZV3fuK';
const TABLE_SKILLS   = 'tblipOYB5NubdTLyJUI';
const TABLE_PARTNERS = 'tbl6F420n83fHqdax2A';
const TABLE_WEB      = 'tblKp0hatJz94yLnNGR';
const TABLE_ACH_CAT  = 'tblbQvz1AwKkRZoaXBj';  // 成就类别表
const TABLE_ACH_TIER = 'tbl05q2jCD5Q9ErYcK5';  // 成就等级表
const TABLE_ACH_IMG  = 'tblavDgXC3oGmQ687pK';  // 成就勋章图片表
const TABLE_WISH     = 'tbl35B5sj6WqDOnDqKy';  // 许愿池表
const TABLE_TRACKING = 'tbll6dJLBRLkrpOWt9b';  // 操作追踪表

// ─── SSO 配置 ─────────────────────────────────────────────────────
const SSO_APP_ID   = '1475405957';
const SSO_FC_BASE  = 'https://liujuwei-sso-mmyoppocwk.cn-hangzhou.fcapp.run';
const SSO_LOGIN_URL = `https://sso.100tal.com/portal/login/${SSO_APP_ID}`;

const HEADERS = {
  Authorization: `Bearer ${TEABLE_TOKEN}`,
  'Content-Type': 'application/json',
};

// ─── 通用 Teable CRUD ───────────────────────────────────────────
const _inflight = {};
const CACHE_TTL = 120000; // 2分钟缓存

function _cacheKey(tableId) { return 'tc_' + tableId; }

function _cacheGet(tableId) {
  try {
    const raw = sessionStorage.getItem(_cacheKey(tableId));
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) { sessionStorage.removeItem(_cacheKey(tableId)); return null; }
    return data;
  } catch { return null; }
}

function _cacheSet(tableId, data) {
  // 跳过大数据表（base64图片），避免 sessionStorage 超限
  if (tableId === TABLE_ACH_IMG) return;
  try { sessionStorage.setItem(_cacheKey(tableId), JSON.stringify({ data, ts: Date.now() })); } catch {}
}

async function teableGet(tableId, skipCache) {
  if (!skipCache) {
    const cached = _cacheGet(tableId);
    if (cached) return cached;
  }
  if (_inflight[tableId]) return _inflight[tableId];
  _inflight[tableId] = (async () => {
    const res = await fetch(
      `${TEABLE_BASE}/api/table/${tableId}/record?fieldKeyType=name&take=1000`,
      { headers: HEADERS }
    );
    if (!res.ok) throw new Error('获取数据失败');
    const data = (await res.json()).records || [];
    _cacheSet(tableId, data);
    delete _inflight[tableId];
    return data;
  })();
  return _inflight[tableId];
}

function cacheClear(tableId) { sessionStorage.removeItem(_cacheKey(tableId)); }

async function teableCreate(tableId, fields) {
  const res = await fetch(`${TEABLE_BASE}/api/table/${tableId}/record`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ fieldKeyType: 'name', records: [{ fields }] }),
  });
  if (!res.ok) throw new Error('创建失败');
  cacheClear(tableId);
  return (await res.json()).records?.[0];
}

async function teableUpdate(tableId, id, fields) {
  const res = await fetch(`${TEABLE_BASE}/api/table/${tableId}/record`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify({ fieldKeyType: 'name', records: [{ id, fields }] }),
  });
  if (!res.ok) throw new Error('更新失败');
  cacheClear(tableId);
  return (await res.json()).records?.[0];
}

async function teableDelete(tableId, id) {
  const res = await fetch(`${TEABLE_BASE}/api/table/${tableId}/record/${id}`, {
    method: 'DELETE',
    headers: HEADERS,
  });
  if (!res.ok) throw new Error('删除失败');
  cacheClear(tableId);
}

// ─── 用户相关 ───────────────────────────────────────────────────
async function findUser(account) {
  // 用过滤 API 精确查询，不拉全表
  try {
    const filter = encodeURIComponent(JSON.stringify({ fieldKey: '账号', operator: 'is', value: account }));
    const res = await fetch(
      `${TEABLE_BASE}/api/table/${TABLE_USER}/record?fieldKeyType=name&take=1&filter=${filter}`,
      { headers: HEADERS }
    );
    if (res.ok) {
      const data = await res.json();
      if (data.records?.length > 0) return data.records[0];
    }
  } catch {}
  // fallback: 拉全表查找
  const records = await teableGet(TABLE_USER);
  return records.find(r => r.fields['账号'] === account) || null;
}

function getCurrentUser() {
  const s = localStorage.getItem('badge_user');
  if (!s) return null;
  const user = JSON.parse(s);
  if (user.role === '游客') return user;
  const sso = getSavedSSO();
  if (!sso) {
    localStorage.removeItem('badge_user');
    return null;
  }
  return user;
}

function requireLogin() {
  if (!getCurrentUser()) {
    window.location.href = 'index.html';
    return false;
  }
  return true;
}

function logout() {
  localStorage.removeItem('badge_user');
  localStorage.removeItem('sso_jwt');
  localStorage.setItem('sso_logout', '1');
  window.location.href = SSO_LOGIN_URL;
}

function isAdmin() {
  const u = getCurrentUser();
  return u && u.role === '管理员';
}

// ─── SSO 认证 ─────────────────────────────────────────────────
function decodeJWT(token) {
  const payload = token.split('.')[1];
  const bin = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes));
}

function getSavedSSO() {
  const jwt = localStorage.getItem('sso_jwt');
  if (!jwt) return null;
  try {
    const payload = decodeJWT(jwt);
    if (payload.exp * 1000 < Date.now()) {
      localStorage.removeItem('sso_jwt');
      return null;
    }
    return { token: jwt, payload };
  } catch {
    localStorage.removeItem('sso_jwt');
    return null;
  }
}

async function handleSSOCallback(ssoToken) {
  const res = await fetch(`${SSO_FC_BASE}/auth/callback?token=${encodeURIComponent(ssoToken)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'SSO验证失败');
  }
  const data = await res.json();
  localStorage.setItem('sso_jwt', data.token);

  const payload = decodeJWT(data.token);
  const emailPrefix = (payload.email || '').split('@')[0];
  const record = await findUser(emailPrefix);

  if (record) {
    const f = record.fields;
    if (f['状态'] === '已禁用') throw new Error('账号已被禁用');
    teableUpdate(TABLE_USER, record.id, {
      '最后登录': new Date().toISOString(),
      '邮箱': payload.email || '',
      '工号': payload.workcode || '',
    });
    if (f['状态'] !== '已激活') {
      await teableUpdate(TABLE_USER, record.id, { '状态': '已激活' });
    }
    localStorage.setItem('badge_user', JSON.stringify({
      id: record.id,
      account: f['账号'],
      nickname: f['昵称'],
      role: f['角色'] || '普通用户',
    }));
  } else {
    localStorage.setItem('badge_user', JSON.stringify({
      id: 'sso_guest',
      account: emailPrefix || payload.workcode || 'sso_user',
      nickname: payload.name || '访客',
      role: '游客',
    }));
  }

  window.location.href = 'home.html';
}

function openPwdModal() {
  alert('密码请通过公司SSO系统修改');
}

// ─── 成就勋章系统 ─────────────────────────────────────────────
// 默认值（从多维表加载后会被覆盖）
let ACHIEVEMENT_BADGES = [
  { key: 'sharer',   name: '分享家',   icon: '📅', color: '#f59e0b' },
  { key: 'skills',   name: 'Skills',   icon: '🛠️', color: '#3b82f6' },
  { key: 'partners', name: '数字伙伴', icon: '🤖', color: '#2cb67d' },
  { key: 'web',      name: '网页',     icon: '🌐', color: '#ec4899' },
  { key: 'agent',    name: 'Agent',    icon: '🧠', color: '#8b5cf6' },
  { key: 'wish',     name: '愿望实现', icon: '🌟', color: '#fbbf24' },
];

let ACHIEVEMENT_TIERS = [
  { level: 1, name: '新锐',   threshold: 1,   cls: 'tier-xinrui',    stars: 1 },
  { level: 2, name: '精进',   threshold: 3,   cls: 'tier-jingjin',   stars: 2 },
  { level: 3, name: '卓越',   threshold: 10,  cls: 'tier-zhuoyue',   stars: 3 },
  { level: 4, name: '领军',   threshold: 30,  cls: 'tier-lingjun',   stars: 4 },
  { level: 5, name: '巅峰',   threshold: 100, cls: 'tier-dianfeng',  stars: 5 },
];

const TIER_CLS_MAP = { 1: 'tier-xinrui', 2: 'tier-jingjin', 3: 'tier-zhuoyue', 4: 'tier-lingjun', 5: 'tier-dianfeng' };

// 成就勋章图片缓存 { "sharer_1": "data:image/..." }
let achievementImageMap = {};

// 从多维表加载成就配置（轻量：仅类别+等级）
async function loadAchievementConfig() {
  try {
    const [cats, tiers] = await Promise.all([
      teableGet(TABLE_ACH_CAT), teableGet(TABLE_ACH_TIER),
    ]);
    if (cats.length > 0) {
      ACHIEVEMENT_BADGES = cats
        .sort((a, b) => (a.fields['排序']||0) - (b.fields['排序']||0))
        .map(c => ({
          key: c.fields['key'],
          name: c.fields['名称'],
          icon: c.fields['图标'],
          color: c.fields['颜色'],
        }));
    }
    if (tiers.length > 0) {
      ACHIEVEMENT_TIERS = tiers
        .sort((a, b) => (a.fields['等级']||0) - (b.fields['等级']||0))
        .map(t => ({
          level: t.fields['等级'],
          name: t.fields['名称'],
          threshold: t.fields['阈值'],
          cls: TIER_CLS_MAP[t.fields['等级']] || 'tier-xinrui',
          stars: t.fields['等级'],
        }));
    }
  } catch(e) { console.warn('加载成就配置失败，使用默认值', e); }
}

// 单独加载勋章图片（仅 gallery 页需要，数据量大）
async function loadAchievementImages() {
  try {
    const imgs = await teableGet(TABLE_ACH_IMG);
    achievementImageMap = {};
    imgs.forEach(r => {
      const key = r.fields['类别key'];
      const level = r.fields['等级'];
      const img = r.fields['勋章图片'];
      if (key && level && img) achievementImageMap[key + '_' + level] = img;
    });
  } catch(e) {}
}

// 计算用户在各模块的贡献数量
// account: 用户账号(如 liujuwei), nickname: 用户昵称(如 刘聚伟)
function computeUserContributions(account, nickname, activities, skills, partners, webApps, wishes) {
  // 活动记录：分享者可能是"全体"(所有人)、单人昵称、多人空格分隔昵称
  const sharerCount = activities.filter(e => {
    const s = (e.fields['分享者'] || '').trim();
    if (s === '全体') return true;
    return s.split(/\s+/).some(n => n === nickname);
  }).length;

  // Skills：上传者字段是账号名(如 liujuwei)，只取字母部分匹配(忽略尾部数字)
  const alphaOnly = str => str.replace(/\d+/g, '');
  const skillCount = skills.filter(s => alphaOnly(s.fields['上传者'] || '') === alphaOnly(account)).length;

  // 数字伙伴：开发者字段是昵称(如 刘聚伟)
  const partnerCount = partners.filter(p => (p.fields['开发者'] || '') === nickname).length;

  // 网页成果：开发者字段是昵称
  const webCount = (webApps || []).filter(w => (w.fields['开发者'] || '') === nickname).length;

  // 愿望实现：作为领取者完成的愿望数
  const wishCount = (wishes || []).filter(w => w.fields['领取者'] === account && w.fields['状态'] === '已完成').length;

  return {
    sharer: sharerCount,
    skills: skillCount,
    partners: partnerCount,
    web: webCount,
    agent: 0,  // 待数据接入
    wish: wishCount,
  };
}

// 根据贡献数量获取达到的最高等级
function getAchievedTier(count) {
  let tier = null;
  for (const t of ACHIEVEMENT_TIERS) {
    if (count >= t.threshold) tier = t;
  }
  return tier;
}

// 生成用户的全部成就勋章列表 (earned + locked)
function generateAchievementBadges(contributions) {
  const result = { earned: [], locked: [] };
  for (const badge of ACHIEVEMENT_BADGES) {
    const count = contributions[badge.key] || 0;
    const achievedTier = getAchievedTier(count);
    // 已达到的所有等级
    for (const tier of ACHIEVEMENT_TIERS) {
      const badgeData = {
        key: badge.key,
        badgeName: badge.name,
        icon: badge.icon,
        color: badge.color,
        tier: tier,
        fullName: `${tier.name}${badge.name}`,
        count: count,
        nextThreshold: tier.threshold,
      };
      if (count >= tier.threshold) {
        result.earned.push(badgeData);
      } else {
        result.locked.push(badgeData);
      }
    }
  }
  return result;
}

// ─── 勋章视觉渲染 ─────────────────────────────────────────────
function getBadgeTier(score) {
  if (score >= 50) return { name: '传说', cls: 'tier-legendary', stars: 5 };
  if (score >= 30) return { name: '史诗', cls: 'tier-epic', stars: 4 };
  if (score >= 10) return { name: '稀有', cls: 'tier-rare', stars: 3 };
  return { name: '普通', cls: 'tier-common', stars: 2 };
}

function renderStars(count, maxStars, color) {
  let html = '';
  for (let i = 0; i < maxStars; i++) {
    html += `<span class="badge-star ${i < count ? 'filled' : 'empty'}" style="${i < count ? '--badge-color:'+color : ''}"></span>`;
  }
  return html;
}

// 渲染勋章图标区域（支持图片URL/GIF或emoji）
function renderMedalVisual(icon, image, color) {
  if (image) {
    return `<div class="medal-frame">
      <div class="medal-ring"></div>
      <div class="medal-inner">
        <img class="medal-img" src="${image}" alt="" draggable="false">
      </div>
    </div>`;
  }
  return `<div class="medal-frame">
    <div class="medal-ring"></div>
    <div class="medal-inner">
      <span class="medal-icon">${icon}</span>
    </div>
  </div>`;
}

// 渲染成就勋章卡片（已获得）
function renderAchievementCard(badge) {
  const { key, icon, color, tier, fullName, count, badgeName } = badge;
  const image = achievementImageMap[key + '_' + tier.level] || '';
  const particleCount = tier.level >= 5 ? 8 : tier.level >= 4 ? 6 : tier.level >= 3 ? 5 : tier.level >= 2 ? 3 : 2;
  let particles = '';
  for (let i = 0; i < particleCount; i++) particles += '<span></span>';

  const visual = image
    ? `<div class="medal-frame"><div class="medal-ring"></div><div class="medal-inner"><img class="medal-img" src="${image}" alt="" draggable="false"></div></div>`
    : `<div class="medal-frame"><div class="medal-ring"></div><div class="medal-inner"><span class="medal-icon">${icon}</span></div></div>`;

  // 所有等级均渲染 圣光 / 彩虹边框 / 霓虹灯
  const holyLight = `<div class="holy-light holy-light-${tier.level}"></div>`;
  const rainbowBorder = '<div class="rainbow-border"></div>';
  const neonBorder = '<div class="neon-border"></div>';

  // 烟花: Lv1=1, Lv2=2, Lv3=3, Lv4=3, Lv5=4
  const fwCount = tier.level >= 5 ? 4 : tier.level >= 3 ? 3 : tier.level >= 2 ? 2 : 1;
  let fireworks = ''; for (let i = 0; i < fwCount; i++) fireworks += '<span></span>';

  // 流星: Lv1=1, Lv2=1, Lv3=2, Lv4=2, Lv5=3
  const mtCount = tier.level >= 5 ? 3 : tier.level >= 3 ? 2 : 1;
  let meteors = ''; for (let i = 0; i < mtCount; i++) meteors += '<span></span>';

  // 闪电: Lv3+=1, Lv5=2
  const ltCount = tier.level >= 5 ? 2 : tier.level >= 3 ? 1 : 0;
  let lightning = ''; for (let i = 0; i < ltCount; i++) lightning += '<span></span>';

  return `<div class="badge-card badge-earned achievement-tier-${tier.level}" style="--badge-color:${color};--badge-glow:${color}50">
    ${rainbowBorder}
    ${neonBorder}
    ${particles ? `<div class="badge-particles fire-particles">${particles}</div>` : ''}
    <div class="firework-particles">${fireworks}</div>
    <div class="meteor-particles">${meteors}</div>
    ${ltCount > 0 ? `<div class="lightning-effects">${lightning}</div>` : ''}
    ${holyLight}
    ${visual}
    <div class="badge-name">${fullName}</div>
    <div class="badge-stars">${renderStars(tier.stars, 5, color)}</div>
    <span class="tier-ribbon ${tier.cls}">${tier.name}</span>
    <div class="badge-cat">${badgeName} · ${count} 项成果</div>
  </div>`;
}

// 渲染成就勋章卡片（未获得）
function renderLockedAchievementCard(badge) {
  const { key, icon, fullName, badgeName, nextThreshold, tier } = badge;
  const image = achievementImageMap[key + '_' + tier.level] || '';
  const visual = image
    ? `<div class="medal-frame"><div class="medal-inner"><img class="medal-img" src="${image}" alt="" draggable="false"></div></div>`
    : `<div class="medal-frame"><div class="medal-inner"><span class="medal-icon">${icon}</span></div></div>`;

  return `<div class="badge-card badge-locked">
    ${visual}
    <div class="badge-name">${fullName}</div>
    <div class="badge-lock-label">🔒 需要 ${nextThreshold} 项${badgeName}成果</div>
  </div>`;
}

// 渲染已获得的勋章卡片
function renderBadgeCard(award, badgeMap) {
  const b = badgeMap[award.fields['勋章名称']];
  const icon = b?.fields['图标'] || '🏅';
  const color = b?.fields['颜色'] || '#7f5af0';
  const image = b?.fields['勋章图片'] || '';
  const cat = b?.fields['分类'] || '';
  const score = b?.fields['价值分'] || 0;
  const date = award.fields['授予时间'] ? new Date(award.fields['授予时间']).toLocaleDateString('zh-CN') : '';
  const tier = getBadgeTier(score);
  const isLegendary = score >= 50;

  // 根据价值分映射特效等级
  const effectTier = score >= 50 ? 5 : score >= 30 ? 4 : score >= 10 ? 3 : score >= 3 ? 2 : 1;

  const pCount = score >= 50 ? 6 : score >= 30 ? 4 : score >= 10 ? 3 : 2;
  let fireParticles = '';
  for (let i = 0; i < pCount; i++) fireParticles += '<span></span>';

  const fwCount = effectTier >= 5 ? 4 : effectTier >= 3 ? 3 : effectTier >= 2 ? 2 : 1;
  let fireworks = ''; for (let i = 0; i < fwCount; i++) fireworks += '<span></span>';

  const mtCount = effectTier >= 5 ? 3 : effectTier >= 3 ? 2 : 1;
  let meteors = ''; for (let i = 0; i < mtCount; i++) meteors += '<span></span>';

  const ltCount = effectTier >= 5 ? 2 : effectTier >= 3 ? 1 : 0;
  let lightning = ''; for (let i = 0; i < ltCount; i++) lightning += '<span></span>';

  return `<div class="badge-card badge-earned achievement-tier-${effectTier}" style="--badge-color:${color};--badge-glow:${color}50">
    <div class="rainbow-border"></div>
    <div class="neon-border"></div>
    <div class="badge-particles fire-particles">${fireParticles}</div>
    <div class="firework-particles">${fireworks}</div>
    <div class="meteor-particles">${meteors}</div>
    ${ltCount > 0 ? `<div class="lightning-effects">${lightning}</div>` : ''}
    <div class="holy-light holy-light-${effectTier}"></div>
    ${renderMedalVisual(icon, image, color)}
    <div class="badge-name">${award.fields['勋章名称']}</div>
    <div class="badge-stars">${renderStars(tier.stars, 5, color)}</div>
    <span class="tier-ribbon ${tier.cls}">${tier.name}</span>
    ${cat ? `<div class="badge-cat">${cat}</div>` : ''}
    ${date ? `<div class="badge-date">${date} 获得</div>` : ''}
  </div>`;
}

// 渲染未获得的勋章卡片（灰暗）
function renderLockedBadgeCard(badge) {
  const icon = badge.fields['图标'] || '🏅';
  const image = badge.fields['勋章图片'] || '';
  const cat = badge.fields['分类'] || '';

  return `<div class="badge-card badge-locked">
    ${image
      ? `<div class="medal-frame"><div class="medal-inner"><img class="medal-img" src="${image}" alt="" draggable="false"></div></div>`
      : `<div class="medal-frame"><div class="medal-inner"><span class="medal-icon">${icon}</span></div></div>`
    }
    <div class="badge-name">${badge.fields['名称']}</div>
    <div class="badge-lock-label">🔒 未获得</div>
    ${cat ? `<div class="badge-cat">${cat}</div>` : ''}
  </div>`;
}

// ─── 点击埋点追踪 ──────────────────────────────────────────────
function _trackingWrite(fields) {
  fetch(`${TEABLE_BASE}/api/table/${TABLE_TRACKING}/record`, {
    method: 'POST', headers: HEADERS,
    body: JSON.stringify({ fieldKeyType: 'name', records: [{ fields }] }),
  }).catch(() => {});
}

function trackClick(action, page) {
  if (!action) return;
  const u = getCurrentUser();
  if (!u && page !== 'index.html') return;
  _trackingWrite({
    '时间': new Date().toISOString(),
    '账号': u?.account || '',
    '昵称': u?.nickname || '',
    '页面': page,
    '操作': action,
  });
}

document.addEventListener('click', function(e) {
  const el = e.target.closest('button, a[href], [onclick]');
  if (!el) return;
  const page = location.pathname.split('/').pop() || 'index.html';
  let action = '';
  const oc = el.getAttribute('onclick');
  if (oc) {
    const m = oc.match(/^(\w+)\(/);
    if (m) action = m[1];
  } else if (el.tagName === 'A' && el.getAttribute('href')) {
    action = 'nav:' + el.getAttribute('href').replace('.html', '');
  }
  if (!action) action = 'click:' + (el.textContent || '').trim().substring(0, 20);
  if (action && action !== 'click:') trackClick(action, page);
}, true);
