var map = new maplibregl.Map({
  container: "map",
  style: "https://tile.openstreetmap.jp/styles/osm-bright-ja/style.json",
  center: [139.423323139, 35.998809],
  zoom: 14,
  pitch: 0,
});

// 現在地コントロール（GPS・電波不要）
map.addControl(
  new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showUserHeading: true,
  }),
  "top-left",
);

// ズーム・方位コントロール
map.addControl(new maplibregl.NavigationControl(), "top-right");

// データファイル定義
// ★ KML/GPXを追加する場合はここに追記する
const dataFiles = [
  {
    id: "suijin",
    file: "arakawa_suijin_marker.kml",
    type: "kml",
    lineColor: "#c0392b",
    pointColor: "#e74c3c",
  },
  {
    id: "toilet",
    file: "toilet.kml",
    type: "kml",
    lineColor: "#0f766e",
    pointColor: "#0ea5e9",
  },
  {
    id: "route",
    file: "d_west.gpx",
    type: "gpx",
    lineColor: "#d95e21",
    pointColor: "#3498db",
  },
  {
    id: "outbound_kumagaya-2026",
    file: "Outbound_2026_kumagaya.gpx",
    type: "gpx",
    lineColor: "#431296",
    pointColor: "#3498db",
  },
  {
    id: "return_kumagaya-2026",
    file: "Return_2026_kumagaya.gpx",
    type: "gpx",
    lineColor: "#961247",
    pointColor: "#3498db",
  },
  {
    id: "ranzanmati",
    file: "ranzanmati.gpx",
    type: "gpx",
    lineColor: "#4338ca",
    pointColor: "#4338ca",
  },
];

const layerIdsByGroup = {};
let toiletIconLoaded = false;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setGroupVisibility(groupId, visible) {
  (layerIdsByGroup[groupId] || []).forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(
        layerId,
        "visibility",
        visible ? "visible" : "none",
      );
    }
  });
}

// GeoJSONをline/pointレイヤーとして地図に追加する（静的ファイル・ドロップ追加分の両方で利用）
function addGeoJSONLayer(id, geojson, options) {
  layerIdsByGroup[id] = [id + "-line", id + "-point"];

  map.addSource(id, { type: "geojson", data: geojson });

  // ルートライン
  map.addLayer({
    id: id + "-line",
    type: "line",
    source: id,
    filter: ["in", "$type", "LineString"],
    paint: {
      "line-color": options.lineColor,
      "line-width": 5,
      "line-opacity": 0.85,
    },
  });

  // マーカー（トイレはPNGアイコン、その他は円）
  if (options.useToiletIcon && toiletIconLoaded) {
    map.addLayer({
      id: id + "-point",
      type: "symbol",
      source: id,
      filter: ["==", "$type", "Point"],
      layout: {
        "icon-image": "toilet-icon",
        "icon-size": 0.05,
        "icon-allow-overlap": true,
      },
    });
  } else {
    map.addLayer({
      id: id + "-point",
      type: "circle",
      source: id,
      filter: ["==", "$type", "Point"],
      paint: {
        "circle-radius": 9,
        "circle-color": options.pointColor,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
        "circle-opacity": 0.9,
      },
    });
  }

  // マーカータップでポップアップ
  map.on("click", id + "-point", (e) => {
    const props = e.features[0].properties;
    const name = props.name || "（名称なし）";
    const rawDesc = props.description || "";
    const desc = rawDesc
      .replace(/<img[^>]*>/gi, "")
      .replace(/<[^>]*>/g, "")
      .trim();
    new maplibregl.Popup({ maxWidth: "240px" })
      .setLngLat(e.features[0].geometry.coordinates)
      .setHTML(
        "<strong>" +
          escapeHtml(name) +
          "</strong>" +
          (desc ? "<br><small>" + escapeHtml(desc) + "</small>" : ""),
      )
      .addTo(map);
  });

  map.on("mouseenter", id + "-point", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", id + "-point", () => {
    map.getCanvas().style.cursor = "";
  });
}

function removeGeoJSONLayer(id) {
  [id + "-line", id + "-point"].forEach((layerId) => {
    if (map.getLayer(layerId)) map.removeLayer(layerId);
  });
  if (map.getSource(id)) map.removeSource(id);
  delete layerIdsByGroup[id];
}

// ============================================================
// ドロップしたGPX/KMLをIndexedDBに保存し、次回起動時も復元する
// ============================================================
const CUSTOM_DB_NAME = "suijin-map-custom-layers";
const CUSTOM_DB_VERSION = 1;
const CUSTOM_STORE_NAME = "layers";

function openCustomLayerDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CUSTOM_DB_NAME, CUSTOM_DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(CUSTOM_STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function saveCustomLayerRecord(record) {
  return openCustomLayerDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(CUSTOM_STORE_NAME, "readwrite");
        tx.objectStore(CUSTOM_STORE_NAME).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

function deleteCustomLayerRecord(id) {
  return openCustomLayerDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(CUSTOM_STORE_NAME, "readwrite");
        tx.objectStore(CUSTOM_STORE_NAME).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

function getAllCustomLayerRecords() {
  return openCustomLayerDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(CUSTOM_STORE_NAME, "readonly");
        const request = tx.objectStore(CUSTOM_STORE_NAME).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

const customLayerPanel = document.getElementById("customLayerPanel");
const customPalette = [
  "#16a34a",
  "#ca8a04",
  "#9333ea",
  "#0891b2",
  "#dc2626",
  "#4338ca",
];
let customLayerCount = 0;

function nextCustomColor() {
  const color = customPalette[customLayerCount % customPalette.length];
  customLayerCount += 1;
  return color;
}

function createCustomLayerRow(record) {
  const row = document.createElement("div");
  row.className = "custom-layer-row";
  row.dataset.customLayerId = record.id;

  const label = document.createElement("label");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = true;
  checkbox.addEventListener("change", () => {
    setGroupVisibility(record.id, checkbox.checked);
  });

  const name = document.createElement("span");
  name.className = "custom-layer-name";
  name.textContent = record.name;

  label.appendChild(checkbox);
  label.appendChild(name);

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.textContent = "×";
  deleteButton.setAttribute("aria-label", record.name + " を削除");
  deleteButton.addEventListener("click", () => {
    removeCustomLayer(record.id);
  });

  row.appendChild(label);
  row.appendChild(deleteButton);
  customLayerPanel.appendChild(row);
}

function addCustomLayer(record, persist) {
  let geojson;
  try {
    const doc = new DOMParser().parseFromString(record.xml, "text/xml");
    geojson =
      record.fileType === "gpx" ? toGeoJSON.gpx(doc) : toGeoJSON.kml(doc);
  } catch (error) {
    console.warn(record.name + " の解析に失敗しました", error);
    return;
  }

  addGeoJSONLayer(record.id, geojson, {
    lineColor: record.lineColor,
    pointColor: record.pointColor,
  });
  createCustomLayerRow(record);

  if (persist) {
    saveCustomLayerRecord(record).catch((error) =>
      console.warn("カスタムレイヤーの保存に失敗しました", error),
    );
  }
}

function removeCustomLayer(id) {
  removeGeoJSONLayer(id);
  const row = customLayerPanel.querySelector(
    '[data-custom-layer-id="' + id + '"]',
  );
  if (row) row.remove();
  deleteCustomLayerRecord(id).catch((error) =>
    console.warn("カスタムレイヤーの削除に失敗しました", error),
  );
}

function loadCustomLayersFromDB() {
  getAllCustomLayerRecords()
    .then((records) => {
      records
        .sort((a, b) => a.createdAt - b.createdAt)
        .forEach((record) => {
          customLayerCount += 1;
          addCustomLayer(record, false);
        });
    })
    .catch((error) =>
      console.warn("カスタムレイヤーの読み込みに失敗しました", error),
    );
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function handleDroppedFiles(files) {
  Array.from(files).forEach((file) => {
    const lower = file.name.toLowerCase();
    const fileType = lower.endsWith(".gpx")
      ? "gpx"
      : lower.endsWith(".kml")
        ? "kml"
        : null;

    if (!fileType) {
      console.warn("対応していないファイル形式です: " + file.name);
      return;
    }

    readFileAsText(file)
      .then((xml) => {
        const color = nextCustomColor();
        addCustomLayer(
          {
            id:
              "custom-" +
              Date.now() +
              "-" +
              Math.random().toString(36).slice(2, 8),
            name: file.name.replace(/\.(gpx|kml)$/i, ""),
            fileType,
            xml,
            lineColor: color,
            pointColor: color,
            createdAt: Date.now(),
          },
          true,
        );
      })
      .catch((error) =>
        console.warn(file.name + " の読み込みに失敗しました", error),
      );
  });
}

function setupDragAndDrop() {
  const dropHint = document.getElementById("dropHint");
  let dragCounter = 0;

  window.addEventListener("dragenter", (event) => {
    if (!event.dataTransfer || !event.dataTransfer.types.includes("Files"))
      return;
    event.preventDefault();
    dragCounter += 1;
    dropHint.hidden = false;
  });

  window.addEventListener("dragover", (event) => {
    if (!event.dataTransfer || !event.dataTransfer.types.includes("Files"))
      return;
    event.preventDefault();
  });

  window.addEventListener("dragleave", () => {
    dragCounter = Math.max(0, dragCounter - 1);
    if (dragCounter === 0) dropHint.hidden = true;
  });

  window.addEventListener("drop", (event) => {
    if (!event.dataTransfer || !event.dataTransfer.files.length) return;
    event.preventDefault();
    dragCounter = 0;
    dropHint.hidden = true;
    handleDroppedFiles(event.dataTransfer.files);
  });
}

map.on("load", () => {
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        map.addImage("toilet-icon", img);
        toiletIconLoaded = true;
      } catch (error) {
        console.warn("toilet.png 登録失敗", error);
      }
      resolve();
    };
    img.onerror = () => {
      console.warn("toilet.png 読み込み失敗");
      resolve();
    };
    img.src = "toilet.png";
  }).then(() => {
    dataFiles.forEach((item) => {
      fetch(item.file)
        .then((r) => r.text())
        .then((text) => {
          const doc = new DOMParser().parseFromString(text, "text/xml");
          const geojson =
            item.type === "gpx" ? toGeoJSON.gpx(doc) : toGeoJSON.kml(doc);

          addGeoJSONLayer(item.id, geojson, {
            lineColor: item.lineColor,
            pointColor: item.pointColor,
            useToiletIcon: item.id === "toilet",
          });

          const toggle = document.querySelector(
            '[data-layer-toggle="' + item.id + '"]',
          );
          if (toggle) {
            setGroupVisibility(item.id, toggle.checked);
          }
        })
        .catch((err) => console.warn(item.file + " 読み込みエラー:", err));
    });

    document.querySelectorAll("[data-layer-toggle]").forEach((toggle) => {
      toggle.addEventListener("change", (event) => {
        setGroupVisibility(
          event.target.dataset.layerToggle,
          event.target.checked,
        );
      });
    });
  }); // end .then

  loadCustomLayersFromDB();
  setupDragAndDrop();
});
