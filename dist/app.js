const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const KEYS = { weather: 'outfit.weather.v1', saved: 'outfit.saved.v1', prefs: 'outfit.prefs.v1' };
const defaultWeather = { city: '上海', temp: 21, feels: 22, low: 18, high: 24, condition: '多云', wind: 8, rain: 20, source: '手动天气' };
const demoItems = [
  { id: 'demo-top', name: '米白针织上衣', category: '上装', color: '米色', season: '春秋', warmth: 2, style: '简约', icon: '👚' },
  { id: 'demo-bottom', name: '深蓝直筒牛仔裤', category: '下装', color: '蓝色', season: '四季', warmth: 2, style: '休闲', icon: '👖' },
  { id: 'demo-outer', name: '烟灰短款外套', category: '外套', color: '灰色', season: '春秋', warmth: 2, style: '通勤', icon: '🧥' },
  { id: 'demo-shoes', name: '奶油白乐福鞋', category: '鞋履', color: '白色', season: '四季', warmth: 1, style: '通勤', icon: '👟' }
];
const colorHex = { '黑色':'#222328','白色':'#f2f0e9','灰色':'#8b8e94','米色':'#d8c9aa','棕色':'#77533f','蓝色':'#4c6993','绿色':'#567760','红色':'#9b4545','粉色':'#d69aa9','紫色':'#76628f','黄色':'#d5ad52','多色':'linear-gradient(135deg,#9b4545,#d5ad52,#567760,#4c6993)' };
const weatherIcons = { '晴':'☀️','多云':'⛅','阴':'☁️','小雨':'🌦️','大雨':'🌧️','雪':'🌨️','雾':'🌫️' };
const codeToWeather = code => code === 0 ? '晴' : code <= 3 ? '多云' : code <= 48 ? '雾' : code <= 67 ? '小雨' : code <= 82 ? '大雨' : code <= 86 ? '雪' : '小雨';

let wardrobe = [];
let currentOutfit = [];
let activeCategory = '全部';
let outfitCursor = 0;
let deferredInstallPrompt;

function getJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function setJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function uid() { return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function escapeHTML(value = '') { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function shuffle(array, seed = 0) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) { const j = (Math.abs((seed + 1) * 9301 + i * 49297) % 233280) % (i + 1); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}
function toast(message) {
  const el = $('#snackbar'); el.textContent = message; el.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2200);
}

const db = {
  open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('outfit-muse-db', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('clothes', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  async all() { const conn = await this.open(); return new Promise((resolve, reject) => { const req = conn.transaction('clothes').objectStore('clothes').getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); },
  async put(item) { const conn = await this.open(); return new Promise((resolve, reject) => { const req = conn.transaction('clothes','readwrite').objectStore('clothes').put(item); req.onsuccess = resolve; req.onerror = () => reject(req.error); }); },
  async delete(id) { const conn = await this.open(); return new Promise((resolve, reject) => { const req = conn.transaction('clothes','readwrite').objectStore('clothes').delete(id); req.onsuccess = resolve; req.onerror = () => reject(req.error); }); },
  async clear() { const conn = await this.open(); return new Promise((resolve, reject) => { const req = conn.transaction('clothes','readwrite').objectStore('clothes').clear(); req.onsuccess = resolve; req.onerror = () => reject(req.error); }); }
};

function inferFromName(filename) {
  const s = filename.toLowerCase();
  let category = /裤|jean|pant|trouser/.test(s) ? '下装' : /裙|dress/.test(s) ? (/(连衣|dress)/.test(s) ? '连衣裙' : '下装') : /外套|大衣|夹克|coat|jacket|blazer/.test(s) ? '外套' : /鞋|靴|shoe|sneaker|boot/.test(s) ? '鞋履' : /包|bag|tote/.test(s) ? '包袋' : /帽|围巾|项链|配饰|hat|scarf/.test(s) ? '配饰' : '上装';
  let color = /黑|black/.test(s) ? '黑色' : /白|white|ivory/.test(s) ? '白色' : /灰|gray|grey/.test(s) ? '灰色' : /米|beige|cream/.test(s) ? '米色' : /棕|brown|咖/.test(s) ? '棕色' : /蓝|blue|navy|牛仔/.test(s) ? '蓝色' : /绿|green/.test(s) ? '绿色' : /红|red/.test(s) ? '红色' : /粉|pink/.test(s) ? '粉色' : /紫|purple/.test(s) ? '紫色' : /黄|yellow/.test(s) ? '黄色' : '多色';
  const clean = filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return { category, color, name: clean || `${color}${category}`, season: category === '外套' ? '春秋' : '四季', warmth: category === '外套' ? 3 : 2, style: '简约' };
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const max = 960; const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas'); canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#f4f2ed'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(img,0,0,canvas.width,canvas.height);
        resolve(canvas.toDataURL('image/jpeg', .82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function route(name) {
  $$('.page').forEach(el => el.classList.toggle('active', el.id === `page-${name}`));
  $$('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.route === name));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'wardrobe') renderWardrobe();
  if (name === 'saved') renderSaved();
}

function renderWeather() {
  const w = getJSON(KEYS.weather, defaultWeather);
  $('#weatherCity').textContent = w.city; $('#weatherTemp').textContent = Math.round(w.temp); $('#weatherCondition').textContent = w.condition;
  $('#weatherRange').textContent = `${Math.round(w.low)}–${Math.round(w.high)}°C`; $('#weatherFeels').textContent = `${Math.round(w.feels)}°`;
  $('#weatherWind').textContent = `${Math.round(w.wind)} km/h`; $('#weatherIcon').textContent = weatherIcons[w.condition] || '☁️'; $('#weatherSource').textContent = w.source || '手动天气';
}

function openWeatherModal() {
  const w = getJSON(KEYS.weather, defaultWeather); const form = $('#weatherForm');
  ['city','condition','temp','feels','low','high','wind','rain'].forEach(key => form.elements[key].value = w[key]);
  $('#weatherModal').showModal();
}

async function locateWeather() {
  if (!navigator.geolocation) return toast('当前浏览器不支持定位，请手动填写天气');
  const button = $('#locateWeatherButton'); const old = button.textContent; button.textContent = '正在定位…'; button.disabled = true;
  navigator.geolocation.getCurrentPosition(async pos => {
    try {
      const { latitude, longitude } = pos.coords;
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`;
      const response = await fetch(url); if (!response.ok) throw new Error('weather'); const data = await response.json();
      const w = { city: '当前位置', temp: data.current.temperature_2m, feels: data.current.apparent_temperature, low: data.daily.temperature_2m_min[0], high: data.daily.temperature_2m_max[0], condition: codeToWeather(data.current.weather_code), wind: data.current.wind_speed_10m, rain: data.daily.precipitation_probability_max[0] || 0, source: '定位实时天气' };
      setJSON(KEYS.weather, w); renderWeather(); generateOutfit(); toast('已根据当前位置更新天气');
    } catch { toast('天气获取失败，可以改为手动填写'); }
    finally { button.textContent = old; button.disabled = false; }
  }, () => { button.textContent = old; button.disabled = false; toast('未获得定位权限，请手动填写天气'); }, { timeout: 9000, maximumAge: 600000 });
}

function chooseOutfit() {
  const w = getJSON(KEYS.weather, defaultWeather); const prefs = getJSON(KEYS.prefs, { occasion: '日常', cold: 1 });
  const available = wardrobe.length ? wardrobe : demoItems;
  const targetWarmth = w.feels < 8 ? 3 : w.feels < 21 ? 2 : 1;
  const season = w.temp >= 27 ? '夏季' : w.temp <= 10 ? '冬季' : '春秋';
  const ranked = items => shuffle(items, outfitCursor).sort((a,b) => score(b)-score(a));
  const score = item => (item.season === season ? 4 : item.season === '四季' ? 2 : 0) - Math.abs(Number(item.warmth)-Math.min(3,targetWarmth + Number(prefs.cold||0)-1))*2 + (item.style === prefs.occasion ? 2 : 0);
  const take = categories => { const pool = ranked(available.filter(x => categories.includes(x.category))); return pool[0]; };
  const outfit = [];
  const dress = take(['连衣裙']); const top = take(['上装']); const bottom = take(['下装']);
  if (dress && (outfitCursor % 3 === 2 || !top || !bottom)) outfit.push(dress); else { if (top) outfit.push(top); if (bottom) outfit.push(bottom); }
  if (w.feels < 20 || prefs.cold > 1) { const outer = take(['外套']); if (outer) outfit.push(outer); }
  const shoes = take(['鞋履']); if (shoes) outfit.push(shoes);
  const accent = take(['包袋','配饰']); if (accent && outfit.length < 4) outfit.push(accent);
  return outfit.slice(0,4);
}

function imageHTML(item, cls = '') { return item.image ? `<img class="${cls}" src="${item.image}" alt="${escapeHTML(item.name)}" />` : `<span class="garment-icon">${item.icon || '👕'}</span>`; }
function weatherAdvice(w) {
  if (w.rain >= 60 || /雨/.test(w.condition)) return '降雨概率较高，建议带伞并优先选择耐水鞋履。';
  if (w.feels <= 10) return '体感偏冷，建议增加保暖内层，注意颈部与脚踝保暖。';
  if (w.feels >= 28) return '体感偏热，优先轻薄透气面料，减少叠穿。';
  if (w.wind >= 25) return '风力较大，建议选择防风外套与贴身内层。';
  return '温度舒适，适合轻层次穿法；早晚温差时可灵活增减外层。';
}

function generateOutfit() {
  outfitCursor += 1; currentOutfit = chooseOutfit(); const w = getJSON(KEYS.weather, defaultWeather); const prefs = getJSON(KEYS.prefs, {occasion:'日常',cold:1});
  const colors = [...new Set(currentOutfit.map(x => x.color))]; const styles = [...new Set(currentOutfit.map(x => x.style))];
  $('#outfitItems').innerHTML = currentOutfit.map(item => `<div class="outfit-piece"><div class="piece-image">${imageHTML(item)}<span class="piece-category">${escapeHTML(item.category)}</span></div><h3>${escapeHTML(item.name)}</h3><p>${escapeHTML(item.color)} · ${escapeHTML(item.style)}</p></div>`).join('');
  const titles = ['松弛感日常','轻盈有层次','干净利落的一套','低调但有细节']; $('#outfitTitle').textContent = titles[outfitCursor % titles.length];
  $('#outfitOccasion').textContent = `${prefs.occasion} · ${w.condition}`; $('#confidenceValue').textContent = `${Math.min(97, 82 + currentOutfit.length * 3)}%`;
  $('#outfitReason').textContent = `${colors.join('、') || '中性色'}形成自然呼应，${styles.join('与') || '简约'}风格让整体保持统一。当前体感 ${Math.round(w.feels)}°C，已优先选择${w.feels < 18 ? '适合叠穿、保暖度更高' : '轻薄舒适'}的单品。`;
  $('#outfitTags').innerHTML = `<span>${prefs.occasion}场合</span><span>${w.feels < 18 ? '注意保暖' : '舒适轻盈'}</span><span class="weather-tip">${escapeHTML(weatherAdvice(w))}</span>`;
  $('#outfitSourceNote').textContent = wardrobe.length ? `全部来自你的衣橱 · 共 ${currentOutfit.length} 件` : '当前展示示例，上传后自动切换为你的衣服';
  const saved = getJSON(KEYS.saved, []); const signature = currentOutfit.map(x=>x.id).join('|'); const isSaved = saved.some(x=>x.signature===signature);
  $('#saveOutfitButton').classList.toggle('saved', isSaved); $('#saveOutfitButton').textContent = isSaved ? '♥ 已收藏' : '♡ 收藏这套';
}

function renderWardrobe() {
  const query = $('#wardrobeSearch').value.trim().toLowerCase();
  const filtered = wardrobe.filter(item => (activeCategory === '全部' || (activeCategory === '配饰' ? ['配饰','包袋'].includes(item.category) : item.category === activeCategory)) && `${item.name}${item.color}${item.style}`.toLowerCase().includes(query));
  $('#wardrobeCount').textContent = wardrobe.length; $('#wardrobeGrid').innerHTML = filtered.map(item => `<article class="wardrobe-item"><button data-edit-item="${item.id}"><div class="wardrobe-photo"><img src="${item.image}" alt="${escapeHTML(item.name)}" loading="lazy" /></div><div class="wardrobe-info"><h3>${escapeHTML(item.name)}</h3><p><span class="item-dot" style="background:${colorHex[item.color] || '#aaa'}"></span>${escapeHTML(item.category)} · ${escapeHTML(item.season)}</p></div></button></article>`).join('');
  $('#wardrobeEmpty').hidden = wardrobe.length > 0 || query || activeCategory !== '全部';
  $('#wardrobeGrid').hidden = filtered.length === 0;
  $$('[data-edit-item]').forEach(btn => btn.addEventListener('click', () => openItemModal(btn.dataset.editItem)));
}

function openItemModal(id) {
  const item = wardrobe.find(x => x.id === id); if (!item) return;
  const form = $('#itemForm'); ['id','name','category','color','season','warmth','style'].forEach(key => form.elements[key].value = item[key]);
  $('#editPreview').innerHTML = `<img src="${item.image}" alt="${escapeHTML(item.name)}" />`; $('#itemModal').showModal();
}

async function handleFiles(files) {
  const images = [...files].filter(file => file.type.startsWith('image/')); if (!images.length) return toast('请选择图片文件');
  const notice = $('#uploadToast'); notice.classList.add('show');
  for (let i=0;i<images.length;i++) {
    $('#uploadProgress').textContent = `${i+1} / ${images.length}`;
    try { const meta = inferFromName(images[i].name); await db.put({ id: uid(), image: await compressImage(images[i]), createdAt: Date.now(), ...meta }); } catch { toast(`${images[i].name} 处理失败`); }
  }
  wardrobe = await db.all(); notice.classList.remove('show'); $('#clothingInput').value = ''; renderWardrobe(); generateOutfit(); route('wardrobe'); toast(`已加入 ${images.length} 件衣物，点击卡片可修改标签`);
}

function saveCurrentOutfit() {
  if (!currentOutfit.length) return; const saved = getJSON(KEYS.saved, []); const signature = currentOutfit.map(x=>x.id).join('|');
  const existing = saved.findIndex(x => x.signature === signature);
  if (existing >= 0) { saved.splice(existing,1); toast('已取消收藏'); }
  else { saved.unshift({ id: uid(), signature, date: new Date().toISOString(), weather: getJSON(KEYS.weather, defaultWeather), items: currentOutfit }); toast('已收藏到搭配册'); }
  setJSON(KEYS.saved, saved); outfitCursor -= 1; generateOutfit();
}

function renderSaved() {
  const saved = getJSON(KEYS.saved, []); $('#savedEmpty').hidden = saved.length > 0; $('#savedGrid').hidden = !saved.length;
  $('#savedGrid').innerHTML = saved.map(outfit => `<article class="saved-card card"><div class="saved-card-head"><h3>${escapeHTML(outfit.weather?.city || '今日')}的搭配</h3><span>${new Date(outfit.date).toLocaleDateString('zh-CN',{month:'short',day:'numeric'})}</span></div><div class="saved-thumbs">${outfit.items.map(item=>`<div>${imageHTML(item)}</div>`).join('')}</div><div class="saved-actions"><span>${escapeHTML(outfit.weather?.condition || '')} · ${Math.round(outfit.weather?.temp || 0)}°C</span><button class="remove-saved" data-remove-saved="${outfit.id}">删除</button></div></article>`).join('');
  $$('[data-remove-saved]').forEach(btn => btn.addEventListener('click', () => { setJSON(KEYS.saved, saved.filter(x=>x.id!==btn.dataset.removeSaved)); renderSaved(); toast('已删除收藏'); }));
}

function setDate() { const d = new Date(); $('#todayDate').textContent = d.toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'}); }

async function init() {
  setDate(); renderWeather(); wardrobe = await db.all().catch(()=>[]); renderWardrobe(); renderSaved();
  const prefs = getJSON(KEYS.prefs,{occasion:'日常',cold:1}); $('#occasionSelect').value = prefs.occasion; $('#coldSelect').value = String(prefs.cold); generateOutfit();
  $$('[data-route]').forEach(el => el.addEventListener('click', () => route(el.dataset.route)));
  ['quickUploadButton','wardrobeUploadButton','emptyUploadButton','navUploadButton'].forEach(id => $(`#${id}`).addEventListener('click', () => $('#clothingInput').click()));
  $('#clothingInput').addEventListener('change', e => handleFiles(e.target.files)); $('#swapOutfitButton').addEventListener('click', generateOutfit); $('#saveOutfitButton').addEventListener('click', saveCurrentOutfit);
  $('#editWeatherButton').addEventListener('click', openWeatherModal); $('#locateWeatherButton').addEventListener('click', locateWeather);
  $('#weatherForm').addEventListener('submit', event => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.target)); ['temp','feels','low','high','wind','rain'].forEach(k=>data[k]=Number(data[k])); data.source='手动天气'; setJSON(KEYS.weather,data); $('#weatherModal').close(); renderWeather(); generateOutfit(); toast('天气已更新'); });
  $$('[data-close-modal]').forEach(button => button.addEventListener('click', () => $(`#${button.dataset.closeModal}`).close()));
  $('#itemForm').addEventListener('submit', async event => { event.preventDefault(); const data=Object.fromEntries(new FormData(event.target)); const item=wardrobe.find(x=>x.id===data.id); if (!item) return; Object.assign(item,data,{warmth:Number(data.warmth)}); await db.put(item); wardrobe=await db.all(); $('#itemModal').close(); renderWardrobe(); generateOutfit(); toast('衣物资料已更新'); });
  $('#deleteItemButton').addEventListener('click', async () => { const id=$('#itemForm').elements.id.value; if(!confirm('确定删除这件衣服吗？')) return; await db.delete(id); wardrobe=await db.all(); $('#itemModal').close(); renderWardrobe(); generateOutfit(); toast('已从衣橱删除'); });
  $('#wardrobeSearch').addEventListener('input', renderWardrobe); $$('#categoryFilters .filter-chip').forEach(btn=>btn.addEventListener('click',()=>{ activeCategory=btn.dataset.category; $$('#categoryFilters .filter-chip').forEach(x=>x.classList.toggle('active',x===btn)); renderWardrobe(); }));
  const updatePrefs=()=>{ setJSON(KEYS.prefs,{occasion:$('#occasionSelect').value,cold:Number($('#coldSelect').value)}); generateOutfit(); toast('偏好已保存'); }; $('#occasionSelect').addEventListener('change',updatePrefs); $('#coldSelect').addEventListener('change',updatePrefs);
  $('#clearDataButton').addEventListener('click', async()=>{ if(!confirm('这会永久删除本设备上的衣橱与收藏，确定继续吗？')) return; await db.clear(); Object.values(KEYS).forEach(k=>localStorage.removeItem(k)); wardrobe=[]; renderWeather(); renderWardrobe(); renderSaved(); generateOutfit(); toast('本机数据已清空'); });
  window.addEventListener('beforeinstallprompt', event=>{ event.preventDefault(); deferredInstallPrompt=event; $('#installButton').hidden=false; }); $('#installButton').addEventListener('click',async()=>{ if(!deferredInstallPrompt)return; deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt=undefined; $('#installButton').hidden=true; });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
}

init();

