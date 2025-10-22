// main.js —— 彭城汉韵导览（完整版）

// 1️⃣ 初始化地图
const map = L.map('map').setView([34.26, 117.20], 11);

// 2️⃣ 加载底图
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

// 全局变量：GeoJSON 图层（用于手动搜索）
let geojsonLayer = null;
let heatLayer = null;  // 热力图
// ✅ 新增：路径规划相关
let currentRoute = null;  // 当前路由控件
let selectedTarget = null;  // 选中的终点坐标
const CUMT_COORDS = [34.214571, 117.14509];  // 中国矿业大学南湖校区坐标

// 3️⃣ 加载 GeoJSON 景点数据
fetch('data/sites.geojson')
  .then(resp => {
    if (!resp.ok) throw new Error(`HTTP 错误：${resp.status}`);
    return resp.json();
  })
  .then(data => {
    console.log('✅ 数据加载成功：', data.features.length, '个遗址');

    // 创建GeoJSON图层
    geojsonLayer = L.geoJSON(data, {
      pointToLayer: (feature, latlng) => L.marker(latlng, { 
        icon: L.divIcon({ 
          className: 'han-marker', 
          html: '<i class="fas fa-coins" style="color:var(--secondary-color); font-size:24px; text-shadow:1px 1px 2px rgba(0,0,0,0.5);"></i>', 
          iconSize: [30, 30] 
        }) 
      }),
      onEachFeature: (feature, layer) => {
        const p = feature.properties;
        const latlng = layer.getLatLng();  // 从 layer 获取坐标
        let html = `<div style="font-family:'Noto Serif SC'; background:var(--accent-color); padding:15px; border-radius:var(--border-radius); box-shadow:var(--shadow);"><strong style="color:var(--secondary-color);">${p.name}</strong><br>`;
        if (p.type) html += `类型：${p.type}<br>`;
        if (p.description) html += `${p.description}<br>`;
        if (p.image) {
          html += `<img src="${p.image}" style="width:120px;margin-top:5px; border-radius:8px;" onerror="this.src='https://via.placeholder.com/120?text=汉影'"/>`;
        }
        html += `<br><button onclick="selectTarget(${latlng.lat}, ${latlng.lng})" style="padding:6px 12px; background:var(--secondary-color); color:white; border:none; border-radius:8px; cursor:pointer; font-family:inherit;">选为汉途终点</button></div>`;
        layer.bindPopup(html, { maxWidth: 300, className: 'han-popup' });
        layer.on('click', () => {
          selectTarget(latlng.lat, latlng.lng);
          layer.openPopup();
          startStoryMode(p);  // 故事模式
        });
      }
    }).addTo(map);

    // 热力图叠加（遗址密度）
    const heatPoints = data.features.map(f => [f.geometry.coordinates[1], f.geometry.coordinates[0]]);
    heatLayer = L.heatLayer(heatPoints, { radius: 25, blur: 15, maxZoom: 17, gradient: {0.4: 'blue', 0.65: 'lime', 1: 'red'} }).addTo(map);

    // 初始缩放到所有点
    map.fitBounds(geojsonLayer.getBounds());

    // 绑定导航按钮
    const routeBtn = document.getElementById('route-btn');
    routeBtn.addEventListener('click', startRouting);
    routeBtn.disabled = true;  // 初始禁用，直到选中终点

    console.log("✅ 地图初始化完成");
  })
  .catch(err => {
    console.error("❌ 加载 GeoJSON 出错：", err);
    alert('数据加载失败！请检查 data/sites.geojson 文件路径。');
  });

// ✅ 全局手动搜索函数（供自定义框调用）
function performManualSearch(keyword) {
  if (!geojsonLayer) {
    console.warn("⚠️ GeoJSON 图层未加载");
    return;
  }

  const layers = geojsonLayer.getLayers();
  const matches = [];
  let bounds = L.latLngBounds();  // 初始化空bounds

  // 遍历层，匹配name（忽略大小写）
  layers.forEach(layer => {
    const props = layer.feature ? layer.feature.properties : null;
    if (props && props.name && props.name.toLowerCase().includes(keyword.toLowerCase())) {
      layer.addTo(map);  // 显示匹配层
      matches.push(layer);
      bounds.extend(layer.getLatLng());  // 用 getLatLng() 
      // 高亮：打开popup + 缩放
      layer.openPopup();
    } else {
      map.removeLayer(layer);  // 隐藏非匹配层
    }
  });

  if (matches.length > 0) {
    map.fitBounds(bounds);
    console.log(`✅ 搜索 "${keyword}" 找到 ${matches.length} 个结果`);
    // 可选：高亮动画（第一个匹配）
    const firstMarker = matches[0]._icon;
    if (firstMarker) {
      firstMarker.style.transition = 'transform 0.3s ease';
      firstMarker.style.transform = 'scale(1.6)';
      setTimeout(() => (firstMarker.style.transform = 'scale(1)'), 2000);
    }
  } else {
    console.log(`❌ 未找到 "${keyword}" 的结果`);
    alert(`未找到包含 "${keyword}" 的景点。请尝试其他关键词，如 "狮子山"。`);
    resetAllMarkers();  // 重置显示所有
  }
}

// ✅ 全局重置函数（清空搜索后调用）
function resetAllMarkers() {
  if (!geojsonLayer) return;
  geojsonLayer.addTo(map);  // 显示所有层
  map.fitBounds(geojsonLayer.getBounds());
  console.log("✅ 重置显示所有景点");
}

// ✅ 新增：选中终点函数（Marker点击调用）
function selectTarget(lat, lng) {
  selectedTarget = [lat, lng];
  document.getElementById('route-btn').disabled = false;
  document.getElementById('route-btn').textContent = '导航到选中点';
  console.log(`✅ 选中终点：${lat}, ${lng}`);
}

// ✅ 新增：开始路径规划函数（按钮调用）
function startRouting() {
  if (!selectedTarget) {
    // 若无选中，规划到最近遗址（简单fallback）
    const layers = geojsonLayer.getLayers();
    if (layers.length > 0) {
      const firstLayer = layers[0];
      selectedTarget = firstLayer.getLatLng();
    } else {
      alert('请先点击一个遗址Marker选中终点！');
      return;
    }
  }

  // 清除旧路由
  if (currentRoute) {
    map.removeControl(currentRoute);
  }

  // 创建新路由（步行模式，OSRM免费服务）
  currentRoute = L.Routing.control({
    waypoints: [
      L.latLng(CUMT_COORDS[0], CUMT_COORDS[1]),  // 起点：CUMT
      L.latLng(selectedTarget[0], selectedTarget[1])  // 终点：选中
    ],
    routeWhileDragging: true,
    show: true,
    addWaypoints: false,
    createMarker: function() { return null; },  // 无额外Marker
    lineOptions: { styles: [{ color: 'blue', weight: 4 }] }
  }).addTo(map);

  console.log('✅ 路径规划启动：从CUMT到选中遗址');
}

// ✅ 新增：故事模式（点击Marker叙事，Blue Raster灵感）
function startStoryMode(props) {
  const storyPanel = document.createElement('div');
  storyPanel.innerHTML = `
    <div style="position:fixed; top:20%; right:20px; width:300px; background:var(--accent-color); padding:20px; border-radius:var(--border-radius); box-shadow:var(--shadow); z-index:10001; font-family:'Noto Serif SC'; animation:fadeIn 0.5s;">
      <h3 style="color:var(--secondary-color);">汉墓物语：${props.name}</h3>
      <p>${props.description || '西汉彭城，楚王永眠于狮山，玉衣金缕，千古一叹。'}</p>
      <button onclick="this.parentElement.remove()" style="padding:5px 10px; background:var(--primary-color); color:white; border:none; border-radius:5px;">合卷</button>
    </div>
  `;
  document.body.appendChild(storyPanel);
  setTimeout(() => storyPanel.remove(), 5000); // 5s自动合
}

// 热力图切换（可选按钮调用）
function toggleHeat() {
  if (map.hasLayer(heatLayer)) map.removeLayer(heatLayer);
  else map.addLayer(heatLayer);
}